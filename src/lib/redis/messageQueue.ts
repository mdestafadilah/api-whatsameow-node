/**
 * Redis-backed outbound message queue.
 *
 * Why a queue at all, when sends already work? Two problems it solves:
 *
 *   1. **Backpressure.** A burst of sends (a broadcast, a retry storm) hammers
 *      whatsmeow's single IPC pipe. Queueing bounds how much is in flight and
 *      keeps the per-chat pacing honest instead of racing it.
 *   2. **Durability.** A send that has been accepted should survive a restart.
 *      In-memory arrays lose it; Redis (with AOF) does not.
 *
 * Design choices worth knowing:
 *
 *   - **Payloads are prepared before enqueueing.** `prepareMessage()` resolves
 *     media to bytes and uploads it, producing a proto-shaped message. Doing that
 *     first means the queue holds a finished payload rather than a file path that
 *     may have been deleted or a URL that may have expired by the time the worker
 *     gets to it. It also fails fast: a bad path is rejected by the request, not
 *     silently by a background worker.
 *   - **Redis lists, not streams.** Redis 3.2 has no streams. A list plus a
 *     processing hash gives the same at-least-once behaviour with `BRPOPLPUSH`-
 *     style handoff semantics, hand-rolled.
 *   - **One queue per session.** A session that is disconnected or mid-reconnect
 *     must not block another session's traffic.
 *
 * Delivery is **at-least-once**, not exactly-once: if the process dies between
 * handing a message to whatsmeow and recording the result, that message is
 * retried. WhatsApp does not expose an idempotency key, so a duplicate is
 * possible in that narrow window. For an anti-ban pacing feature, sending twice
 * is the safer failure mode than dropping a message.
 */
import { env } from "@/env";
import type { PacingConfig } from "@/lib/whatsapp/pacing";
import { key, withRedis, type RedisClient } from "./client";

/** Lifecycle of one queued message. */
export type QueuedStatus = "queued" | "sending" | "sent" | "failed";

export type QueuedMessage = {
  /** Stable id, also used as the SQLite row id for this send. */
  id: string;
  sessionId: string;
  /** Resolved destination JID. */
  jid: string;
  /** Chat key (`session:jid`) — the pacing/cooldown bucket. */
  chatKey: string;
  /** Proto-shaped payload, ready for `sendRawMessage`. */
  message: Record<string, unknown>;
  /** `poll` payloads take a different whatsmeow builder. */
  poll?: { question: string; options: string[]; selectableCount: number };
  type: string;
  /** Short human-readable body, for the log and the dashboard. */
  preview: string;
  /**
   * Pacing resolved at enqueue time. Stored rather than recomputed so a config
   * change between enqueue and send cannot silently re-time an accepted send.
   */
  pacing: PacingConfig;
  enqueuedAt: string;
  attempts: number;
  /** Set once the worker finishes, successfully or not. */
  status: QueuedStatus;
  lastError?: string;
};

const queueKey = (sessionId: string) => key("queue", sessionId);
const processingKey = (sessionId: string) => key("queue", sessionId, "processing");
const payloadKey = (id: string) => key("queue", "payload", id);
const sessionsKey = () => key("queue", "sessions");
/** Registry of known payloads, so `depth()` does not need an extra round trip. */
const statsKey = () => key("queue", "stats");

/** How long a payload may sit before it is considered abandoned and swept. */
const PAYLOAD_TTL_SECONDS = 60 * 60 * 24;

/**
 * Enqueue a prepared message for a session.
 *
 * Returns `true` when Redis accepted it, `false` when Redis is unavailable — in
 * which case the caller must send synchronously instead of dropping the message.
 */
export async function enqueue(entry: QueuedMessage): Promise<boolean> {
  if (!env.redisUrl) return false;

  return withRedis(async (client) => {
    // The payload lives in its own key and the list only carries the id. Keeping
    // a large proto payload out of the list means `LRANGE` for the dashboard's
    // queue view does not have to pull every message body across the wire.
    await client.set(payloadKey(entry.id), JSON.stringify(entry), {
      EX: PAYLOAD_TTL_SECONDS,
    });

    const queueLength = await client.lPush(queueKey(entry.sessionId), entry.id);
    await client.sAdd(sessionsKey(), entry.sessionId);

    // Mirror the depth so a dashboard poll does not have to walk every session.
    await client.hIncrBy(statsKey(), "enqueued", 1);
    await client.hSet(statsKey(), "lastEnqueuedAt", entry.enqueuedAt);

    console.log(
      `[queue] enqueued ${entry.id} for ${entry.sessionId} (depth ${queueLength})`,
    );
    return true;
  }, false);
}

/**
 * Take up to `limit` messages for a session, oldest first.
 *
 * Each id is moved to the session's processing list as it is handed out, so a
 * crash mid-send leaves the entry recoverable rather than lost. `claim` is what
 * makes that move atomic from the caller's point of view.
 */
export async function claim(sessionId: string, limit: number): Promise<QueuedMessage[]> {
  if (limit <= 0) return [];

  return withRedis(async (client) => {
    const claimed: QueuedMessage[] = [];

    for (let index = 0; index < limit; index += 1) {
      // rPopLPush pops from the head of the queue and pushes onto processing in
      // one step — the entry exists in exactly one of the two lists at all times.
      const id = await client.rPopLPush(queueKey(sessionId), processingKey(sessionId));
      if (id === null) break;

      const raw = await client.get(payloadKey(id));
      if (!raw) {
        // Payload expired or was swept. Drop the orphaned id and keep going;
        // blocking the whole queue on one bad entry would be worse.
        await client.lRem(processingKey(sessionId), 1, id);
        console.warn(`[queue] dropped orphaned payload ${id}`);
        continue;
      }

      const entry = JSON.parse(raw) as QueuedMessage;
      entry.status = "sending";
      entry.attempts += 1;
      claimed.push(entry);
    }

    return claimed;
  }, []);
}

/** Record the outcome of a claimed message and remove it from processing. */
export async function settle(
  entry: QueuedMessage,
  outcome: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await withRedis(async (client) => {
    const updated: QueuedMessage = outcome.ok
      ? { ...entry, status: "sent" }
      : { ...entry, status: "failed", lastError: outcome.error };

    await client.set(payloadKey(entry.id), JSON.stringify(updated), {
      EX: PAYLOAD_TTL_SECONDS,
    });
    await client.lRem(processingKey(entry.sessionId), 1, entry.id);
    await client.hIncrBy(statsKey(), outcome.ok ? "sent" : "failed", 1);

    return undefined;
  }, undefined);
}

/** Put a message back at the head of its queue after a retryable failure. */
export async function requeue(entry: QueuedMessage, error: string): Promise<void> {
  await withRedis(async (client) => {
    const updated: QueuedMessage = { ...entry, status: "queued", lastError: error };
    await client.set(payloadKey(entry.id), JSON.stringify(updated), {
      EX: PAYLOAD_TTL_SECONDS,
    });
    await client.lRem(processingKey(entry.sessionId), 1, entry.id);
    /**
     * `lPush`, not `rPush`.
     *
     * Redis stores this queue newest-first, so the *next* entry to be claimed is
     * at the tail. Pushing a retry to the tail would send it again immediately,
     * ahead of everything already waiting — one flaky message would starve the
     * queue behind it. Pushing to the head sends it to the back of the line.
     */
    await client.lPush(queueKey(entry.sessionId), entry.id);
    await client.hIncrBy(statsKey(), "retried", 1);
    return undefined;
  }, undefined);
}

/** Current depth for one session (pending + in-flight). */
export async function depth(sessionId: string): Promise<number> {
  return withRedis(async (client) => {
    const [pending, processing] = await Promise.all([
      client.lLen(queueKey(sessionId)),
      client.lLen(processingKey(sessionId)),
    ]);
    return pending + processing;
  }, 0);
}

/** Unavailable-but-answerable snapshot, used whenever Redis cannot be reached. */
function unavailableStats(): QueueStats {
  return {
    enabled: env.redisUrl !== null,
    available: false,
    sessions: [],
    pending: 0,
    processing: 0,
    counters: { enqueued: 0, sent: 0, failed: 0, retried: 0 },
    lastEnqueuedAt: null,
  };
}

/** Global queue snapshot for the dashboard. */
export async function stats(): Promise<QueueStats> {
  return withRedis(async (client) => {
    const sessions = await client.sMembers(sessionsKey());

    const perSession = await Promise.all(
      sessions.map(async (sessionId) => {
        const [pending, processing] = await Promise.all([
          client.lLen(queueKey(sessionId)),
          client.lLen(processingKey(sessionId)),
        ]);
        return { sessionId, pending, processing, total: pending + processing };
      }),
    );

    const counters = await client.hGetAll(statsKey());

    const snapshot: QueueStats = {
      enabled: true,
      available: true,
      sessions: perSession.sort((a, b) => b.total - a.total),
      pending: perSession.reduce((sum, entry) => sum + entry.pending, 0),
      processing: perSession.reduce((sum, entry) => sum + entry.processing, 0),
      counters: {
        enqueued: Number(counters.enqueued ?? 0),
        sent: Number(counters.sent ?? 0),
        failed: Number(counters.failed ?? 0),
        retried: Number(counters.retried ?? 0),
      },
      lastEnqueuedAt: counters.lastEnqueuedAt ?? null,
    };

    return snapshot;
  }, unavailableStats());
}

/**
 * List queued ids for one session in **processing order** (oldest first).
 *
 * `enqueue` pushes left and `claim` pops right, so Redis stores the queue
 * newest-first and the oldest entry — the next one to be sent — sits at the
 * tail. `lRange` can only ever read head→tail, so the slice is taken from the
 * tail and then **reversed in code**. There is no `lRange` window that returns
 * a list backwards; an earlier version of this function assumed there was and
 * silently reported the queue in the opposite order to how it drains.
 *
 * The window is computed from the real length rather than passed as `-limit`,
 * because Redis clamps an out-of-range negative index to 0 instead of erroring:
 * `lRange(key, -limit, -1)` quietly degrades to the whole list whenever `limit`
 * exceeds the queue length.
 */
export async function listIds(sessionId: string, limit = 50): Promise<string[]> {
  return withRedis(async (client) => {
    const length = await client.lLen(queueKey(sessionId));
    if (length === 0) return [];

    const start = Math.max(0, length - limit);
    // Newest-first from Redis; reverse so the caller sees the drain order.
    const newestFirst = await client.lRange(queueKey(sessionId), start, -1);
    return newestFirst.reverse();
  }, []);
}

/** Read a single stored payload, e.g. to show why a message failed. */
export async function peek(id: string): Promise<QueuedMessage | null> {
  return withRedis(async (client) => {
    const raw = await client.get(payloadKey(id));
    return raw ? (JSON.parse(raw) as QueuedMessage) : null;
  }, null);
}

/**
 * Move everything claimed-but-unfinished back onto its queue.
 *
 * Called on boot: a previous process may have died with messages in the
 * processing list, and nothing else would ever pick them up.
 */
export async function recoverProcessing(): Promise<number> {
  return withRedis(async (client) => {
    const sessions = await client.sMembers(sessionsKey());
    let recovered = 0;

    for (const sessionId of sessions) {
      // The processing list is in claim order (oldest claim first). Re-push in
      // reverse so the earliest-claimed message ends up nearest the tail, i.e.
      // next to be claimed again — restoring the original relative order.
      const stuck = await client.lRange(processingKey(sessionId), 0, -1);
      for (const id of stuck.reverse()) {
        const raw = await client.get(payloadKey(id));
        if (!raw) {
          await client.lRem(processingKey(sessionId), 1, id);
          continue;
        }
        const entry = JSON.parse(raw) as QueuedMessage;
        entry.status = "queued";
        await client.set(payloadKey(id), JSON.stringify(entry), { EX: PAYLOAD_TTL_SECONDS });
        await client.lRem(processingKey(sessionId), 1, id);
        // `lPush` for the same reason as `requeue`: the tail is the *next* entry
        // claimed, so pushing there would send recovered work out of order.
        await client.lPush(queueKey(sessionId), id);
        recovered += 1;
      }
    }

    return recovered;
  }, 0);
}

/** Drop all queue state for a session (used when a session is deleted). */
export async function purge(sessionId: string): Promise<void> {
  await withRedis(async (client) => {
    const ids = [
      ...(await client.lRange(queueKey(sessionId), 0, -1)),
      ...(await client.lRange(processingKey(sessionId), 0, -1)),
    ];

    // Payloads are keyed only by message id, so they must be deleted explicitly.
    await Promise.all(ids.map((id) => client.del(payloadKey(id))));

    await client.del(queueKey(sessionId));
    await client.del(processingKey(sessionId));
    await client.sRem(sessionsKey(), sessionId);
    return undefined;
  }, undefined);
}

export type QueueStats = {
  enabled: boolean;
  /** False when Redis is configured but unreachable — the API is still fine. */
  available: boolean;
  sessions: { sessionId: string; pending: number; processing: number; total: number }[];
  pending: number;
  processing: number;
  counters: { enqueued: number; sent: number; failed: number; retried: number };
  lastEnqueuedAt: string | null;
};

/** Exported for tests so the Redis 3.2 command surface can be asserted. */
export const __keys = { queueKey, processingKey, payloadKey, sessionsKey, statsKey };

export type { RedisClient };
