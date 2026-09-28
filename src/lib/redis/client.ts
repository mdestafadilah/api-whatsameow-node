/**
 * Lazily connected Redis, shared by every Redis-backed feature.
 *
 * Two rules shape this module:
 *
 *   1. **Redis is optional.** With no `REDIS_URL` the app runs exactly as
 *      before; every helper reports `null`/no-op instead of throwing.
 *   2. **Redis must not be able to take the API down.** A cache or queue outage
 *      degrades the feature, not the service. So connections are attempted once
 *      in the background, failures are swallowed after being logged, and
 *      individual commands are raced against a short timeout. A caller that
 *      awaits a dead Redis forever is worse than no cache at all.
 *
 * Note the pinned client is `redis@6`, but the server may be as old as Redis
 * 3.2 (the version shipped with Laragon on Windows). Only commands present in
 * 3.2 are used anywhere in this project — no streams, no `SET ... KEEPTTL`, no
 *  `COPY`. If you add a command here, check it against 3.2 first.
 */
import { createClient, type RedisClientType } from "redis";
import { env } from "@/env";

/**
 * The client is pinned to RESP 2 (see `connect()`), so the type must be too —
 * `RedisClientType` defaults to RESP 3 and the two are not interchangeable.
 */
export type RedisClient = RedisClientType<Record<string, never>, Record<string, never>, Record<string, never>, 2>;

/** Commands are abandoned after this long so a hung Redis cannot stall a request. */
const COMMAND_TIMEOUT_MS = 1_000;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;
let disabledLogged = false;

/**
 * Whether Redis was configured at all. This says nothing about reachability —
 * use `isReady()` for that.
 */
export function isEnabled(): boolean {
  return env.redisUrl !== null;
}

/** Whether a usable connection is currently established. */
export function isReady(): boolean {
  return client?.isReady === true;
}

/**
 * Get the shared client, connecting on first use.
 *
 * Returns `null` when Redis is unconfigured or unreachable. Callers must handle
 * that — it is the normal path on a machine without Redis, not an error.
 */
export async function getRedis(): Promise<RedisClient | null> {
  if (!env.redisUrl) {
    if (!disabledLogged) {
      disabledLogged = true;
      console.log("[redis] REDIS_URL not set — Redis features disabled");
    }
    return null;
  }

  if (client?.isReady) return client;

  // Concurrent callers share one connection attempt; without this, a burst of
  // requests would each open their own socket.
  if (!connecting) {
    connecting = connect().finally(() => {
      connecting = null;
    });
  }

  return connecting;
}

async function connect(): Promise<RedisClient | null> {
  const candidate = createClient({
    url: env.redisUrl!,
    /**
     * RESP 2, not the client's default RESP 3.
     *
     * RESP 3 is negotiated with `HELLO`, which Redis only gained in 6.0. Against
     * anything older — including the Redis 3.2 that ships with Laragon on
     * Windows — the handshake fails with `ERR unknown command 'HELLO'` and the
     * connection never opens. RESP 2 is supported everywhere and every command
     * this project uses behaves identically, so pinning it costs nothing and
     * works against both old and new servers.
     */
    RESP: 2,
    socket: {
      // Without these the client retries forever with growing backoff, and a
      // wrong URL looks like a hang rather than a misconfiguration.
      connectTimeout: 3_000,
      reconnectStrategy: (retries, cause) => {
        // A refused connection or an unknown host is a configuration problem,
        // not a blip — retrying it five times just delays boot by seconds and
        // floods the log. Give up immediately so the caller degrades now.
        const code = (cause as NodeJS.ErrnoException | undefined)?.code;
        if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
          return false;
        }

        // Anything else (a timeout, a dropped socket) may well recover.
        return retries > 5 ? false : Math.min(retries * 200, 2_000);
      },
    },
  }) as RedisClient;

  // The client emits `error` for every failed reconnect. Without a listener
  // Node treats it as an unhandled error and kills the process — which is
  // exactly the outage this module exists to absorb.
  candidate.on("error", (error: Error) => {
    console.warn(`[redis] ${error.message}`);
  });

  try {
    await candidate.connect();
    client = candidate;
    console.log(`[redis] connected to ${redact(env.redisUrl!)}`);
    return candidate;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[redis] unavailable (${message}) — continuing without Redis`);

    // Drop the half-open client so the next call retries cleanly.
    try {
      await candidate.disconnect();
    } catch {
      // Already dead; nothing to clean up.
    }
    return null;
  }
}

/**
 * Run a command with a timeout, returning `fallback` on any failure.
 *
 * Every Redis call in this project goes through here so that "Redis is slow"
 * and "Redis is gone" are handled identically: use the fallback and move on.
 */
export async function withRedis<T>(
  operation: (client: RedisClient) => Promise<T>,
  fallback: T,
): Promise<T> {
  const connection = await getRedis();
  if (!connection) return fallback;

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(connection),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`command exceeded ${COMMAND_TIMEOUT_MS}ms`)),
          COMMAND_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[redis] command failed (${message})`);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Namespaced key so one Redis can host several environments. */
export function key(...parts: (string | number)[]): string {
  return [env.redisPrefix, ...parts].join(":");
}

/** Close the connection. Called from the server's shutdown handler. */
export async function closeRedis(): Promise<void> {
  const connection = client;
  client = null;
  if (!connection) return;
  try {
    await connection.quit();
  } catch {
    // Already gone.
  }
}

/** Strip credentials before a URL reaches a log line. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return url;
  }
}
