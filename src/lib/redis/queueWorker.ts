/**
 * Drains the Redis queue and performs the actual sends.
 *
 * The worker is deliberately separate from `messageService` so the queue can be
 * drained by a burst of requests, by a timer, or by an explicit API call. It
 * holds no state of its own: everything it needs lives in Redis, so a restart
 * resumes rather than loses work.
 *
 * Concurrency note: `sendScheduler` (see `lib/whatsapp/pacing.ts`) already
 * serialises per chat, and the worker additionally refuses to drain a session it
 * is already draining. Two drains of the same session would double-send, since
 * pacing schedules the work but does not deduplicate it.
 */
import type { WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { env } from "@/env";
import { clients } from "@/lib/whatsapp/clientManager";
import { computeTypingDelay, sendScheduler, sleep, type PacingConfig } from "@/lib/whatsapp/pacing";
import { messageRepository } from "@/database/repositories/messageRepository";
import * as cache from "@/lib/redis/cache";
import * as queue from "./messageQueue";
import { isEnabled } from "./client";
import type { MessageType } from "@/types/apiResponse";

/** Sessions currently being drained — prevents overlapping drains. */
const draining = new Set<string>();

/** Failures beyond this are not retried; the message is recorded as failed. */
const MAX_ATTEMPTS = 3;

export type DrainResult = {
  sessionId: string;
  sent: number;
  failed: number;
  retried: number;
  /** True when the drain stopped early because Redis reported no work. */
  empty: boolean;
};

/**
 * Send everything waiting for one session, oldest first.
 *
 * Returns counts rather than throwing: a drain is a background activity, and one
 * undeliverable message must not abort the rest of the batch.
 */
export async function drain(sessionId: string): Promise<DrainResult> {
  const result: DrainResult = { sessionId, sent: 0, failed: 0, retried: 0, empty: false };

  if (!isEnabled()) return { ...result, empty: true };

  // A concurrent drain would hand the same message to whatsmeow twice.
  if (draining.has(sessionId)) return { ...result, empty: true };

  const runtime = await clients.get(sessionId);
  if (!runtime?.jid) {
    // Not paired (or not even started). Leave the messages queued — they become
    // drainable once the session connects, and dropping them would lose sends.
    return { ...result, empty: true };
  }

  draining.add(sessionId);
  try {
    // A batch cap keeps one very long queue from monopolising the event loop.
    const batch = await queue.claim(sessionId, env.redisQueueBatch);
    if (batch.length === 0) return { ...result, empty: true };

    for (const entry of batch) {
      const outcome = await deliver(entry, runtime.client);

      if (outcome.ok) {
        await queue.settle(entry, { ok: true });
        await recordSuccess(entry, outcome.waMessageId);
        result.sent += 1;
        continue;
      }

      // A disconnected client is transient — the message is fine, the moment is
      // not. Requeue without burning an attempt so it retries after reconnect.
      if (outcome.retryable && entry.attempts < MAX_ATTEMPTS) {
        await queue.requeue(entry, outcome.error);
        result.retried += 1;
        continue;
      }

      await queue.settle(entry, { ok: false, error: outcome.error });
      await recordFailure(entry, outcome.error);
      result.failed += 1;
    }

    return result;
  } finally {
    draining.delete(sessionId);
  }
}

type DeliveryOutcome =
  | { ok: true; waMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

/**
 * Perform one send, applying the pacing that was resolved at enqueue time.
 *
 * Pacing runs inside the scheduler so it shares the chat's cooldown with any
 * synchronous sends happening at the same moment.
 */
async function deliver(
  entry: queue.QueuedMessage,
  client: WhatsmeowClient,
): Promise<DeliveryOutcome> {
  // Pacing was resolved at enqueue time and stored with the message, so a config
  // change between enqueue and send cannot silently re-time an accepted send.
  const pacing: PacingConfig = entry.pacing;

  try {
    const waMessageId = await sendScheduler.schedule(
      entry.chatKey,
      pacing.chatCooldownMs,
      async () => {
        if (pacing.typing) {
          const delay = computeTypingDelay(entry.preview, pacing);
          try {
            await client.sendChatPresence(entry.jid, "composing");
          } catch {
            // Presence is a courtesy; the message is the point.
          }
          try {
            if (delay > 0) await sleep(delay);
          } finally {
            try {
              await client.sendChatPresence(entry.jid, "paused");
            } catch {
              // As above.
            }
          }
        }

        const sent = entry.poll
          ? await client.sendPollCreation(
              entry.jid,
              entry.poll.question,
              entry.poll.options,
              entry.poll.selectableCount,
            )
          : await client.sendRawMessage(entry.jid, entry.message);

        return sent?.id ?? null;
      },
    );

    return { ok: true, waMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // These read as "try again shortly" rather than "this message is bad".
    const retryable =
      /not connected|disconnected|timeout|ECONNRESET|socket|reconnect/i.test(message);

    return { ok: false, error: message, retryable };
  }
}

/** Flip the queued SQLite row to `sent` once the worker succeeds. */
async function recordSuccess(entry: queue.QueuedMessage, waMessageId: string | null): Promise<void> {
  try {
    await messageRepository.updateStatus(entry.id, "sent", {
      waMessageId,
      error: null,
    });
    // The message log and chat list now show a different status/count.
    await cache.invalidateMessageViews(entry.sessionId);
  } catch (error) {
    // The send already happened; failing here would misreport it as failed.
    console.warn(`[queue] could not update row ${entry.id}: ${describe(error)}`);
  }
}

async function recordFailure(entry: queue.QueuedMessage, error: string): Promise<void> {
  try {
    await messageRepository.updateStatus(entry.id, "failed", { waMessageId: null, error });
    await cache.invalidateMessageViews(entry.sessionId);
  } catch (updateError) {
    console.warn(`[queue] could not update row ${entry.id}: ${describe(updateError)}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drain every session that has work.
 *
 * Called after a connect event and by the optional background timer. Errors are
 * per-session and swallowed, so one broken session cannot stop the sweep.
 */
export async function drainAll(): Promise<DrainResult[]> {
  if (!isEnabled()) return [];

  const snapshot = await queue.stats();
  const results: DrainResult[] = [];

  for (const session of snapshot.sessions) {
    if (session.pending === 0) continue;
    try {
      results.push(await drain(session.sessionId));
    } catch (error) {
      console.warn(`[queue] drain failed for ${session.sessionId}: ${describe(error)}`);
    }
  }

  return results;
}

/** Exposed so the queue endpoint can report what the worker is doing. */
export function drainingSessions(): string[] {
  return [...draining];
}

export type { MessageType };
