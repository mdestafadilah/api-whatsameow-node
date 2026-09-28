/**
 * Read-through cache on Redis.
 *
 * The point is to keep the dashboard's polling cheap. Its session list, status
 * and chat views refetch every few seconds, and each of those currently costs a
 * SQLite query plus, for status, a round trip into the Go process.
 *
 * Two properties matter more than hit rate here:
 *
 *   - **A miss is not an error.** No Redis, a dead Redis, or corrupt JSON all
 *     fall through to the loader. The cache can only ever make things faster,
 *     never wrong — which is why failures are swallowed rather than propagated.
 *   - **`wrap` awaits the loader on a miss.** Callers get the real value, so
 *     this is safe to drop in front of any read without changing behaviour.
 *
 * Invalidation is explicit (`invalidate`), not time-based discovery. The TTL is
 * a backstop for anything a caller forgets to invalidate, not the mechanism.
 */
import { env } from "@/env";
import { key, withRedis } from "./client";

/** Cache a value under `name`, returning the loader's result either way. */
export async function wrap<T>(
  name: string,
  id: string,
  loader: () => Promise<T>,
  ttlSeconds: number = env.redisCacheTtl,
): Promise<T> {
  if (!env.redisUrl) return loader();

  const cacheKey = key("cache", name, id);

  const cached = await withRedis(async (client) => {
    return await client.get(cacheKey);
  }, null);

  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupt entry — drop it and fall through rather than throwing.
      await forget(name, id);
    }
  }

  const value = await loader();

  // Only cache successful, serialisable results. `undefined` round-trips as
  // `null` and would turn a legitimate miss into a cached null on the next call.
  if (value !== undefined && value !== null) {
    await withRedis(async (client) => {
      await client.set(cacheKey, JSON.stringify(value), { EX: ttlSeconds });
      return undefined;
    }, undefined);
  }

  return value;
}

/** Drop one cached entry. Call this after any write that affects it. */
export async function forget(name: string, id: string): Promise<void> {
  if (!env.redisUrl) return;
  await withRedis(async (client) => {
    await client.del(key("cache", name, id));
    return undefined;
  }, undefined);
}

/** Drop every cached entry for one logical name. */
export async function forgetName(name: string): Promise<void> {
  if (!env.redisUrl) return;
  await withRedis(async (client) => {
    const keys = await client.keys(key("cache", name, "*"));
    if (keys.length > 0) await client.del(keys);
    return undefined;
  }, undefined);
}

/**
 * Drop the caches a message send invalidates.
 *
 * A send changes the chat list (new/updated chat) and the message log, so both
 * are cleared together. Kept in one place so a new cache cannot be forgotten by
 * one caller but not another.
 */
export async function invalidateMessageViews(sessionId: string): Promise<void> {
  await Promise.all([
    forget("chats", sessionId),
    forget("messages", sessionId),
    forget("status", sessionId),
  ]);
}

/** Drop everything this session cached, e.g. when the session is deleted. */
export async function invalidateSession(sessionId: string): Promise<void> {
  await Promise.all([
    forget("chats", sessionId),
    forget("messages", sessionId),
    forget("status", sessionId),
    forgetName("sessions"),
  ]);
}

/** Cache names, in one place so typos surface at the call site. */
export const CACHE = {
  sessions: "sessions",
  status: "status",
  chats: "chats",
  messages: "messages",
  health: "health",
} as const;
