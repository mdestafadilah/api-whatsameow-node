import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Redis layer is tested two ways:
 *
 *   - **Here**, without Redis, for the behaviour that must hold when Redis is
 *     absent: fail-open, no throwing, sane defaults. This is the configuration
 *     most people run (Redis is optional), so it is the one that must never
 *     regress.
 *   - **Against a live server** by `outputs/_queue-integration.mjs`, which
 *     exercises the real list mechanics. Those cannot be unit-tested, because
 *     the bugs worth catching there are properties of Redis itself (protocol
 *     handshake, list direction) rather than of this code.
 */

/**
 * `env` imports `dotenv/config`, which loads the developer's real `.env` and
 * would re-inject `REDIS_URL` on every fresh import — defeating the cases
 * below that deliberately run *without* Redis. Stub the loader so these tests
 * see only what they set themselves.
 */
vi.mock("dotenv/config", () => ({}));

/**
 * `env` reads `process.env` once at import time, so each case sets the
 * environment and imports the modules fresh.
 */
async function loadModules(redisUrl: string | undefined) {
  vi.resetModules();
  if (redisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = redisUrl;
  }
  process.env.REDIS_PREFIX = "test";

  const client = await import("@/lib/redis/client");
  const queue = await import("@/lib/redis/messageQueue");
  const cache = await import("@/lib/redis/cache");
  return { client, queue, cache };
}

const originalUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalUrl;
});

describe("redis client without REDIS_URL", () => {
  it("reports disabled rather than ready", async () => {
    const { client } = await loadModules(undefined);
    expect(client.isEnabled()).toBe(false);
    expect(client.isReady()).toBe(false);
  });

  it("resolves null instead of throwing", async () => {
    const { client } = await loadModules(undefined);
    await expect(client.getRedis()).resolves.toBeNull();
  });

  it("returns the fallback from withRedis", async () => {
    const { client } = await loadModules(undefined);
    const result = await client.withRedis(async () => "never called", "fallback");
    expect(result).toBe("fallback");
  });

  it("does not invoke the operation when disabled", async () => {
    const { client } = await loadModules(undefined);
    const operation = vi.fn(async () => "real");
    await client.withRedis(operation, "fallback");
    expect(operation).not.toHaveBeenCalled();
  });

  it("namespaces keys with the configured prefix", async () => {
    const { client } = await loadModules(undefined);
    expect(client.key("queue", "s-1")).toBe("test:queue:s-1");
    expect(client.key("queue", "s-1", "processing")).toBe("test:queue:s-1:processing");
  });

  it("closing without a connection is a no-op", async () => {
    const { client } = await loadModules(undefined);
    await expect(client.closeRedis()).resolves.toBeUndefined();
  });
});

describe("queue without REDIS_URL", () => {
  const entry = {
    id: "m-1",
    sessionId: "s-1",
    jid: "628@s.whatsapp.net",
    chatKey: "s-1:628@s.whatsapp.net",
    message: { conversation: "hi" },
    type: "text",
    preview: "hi",
    pacing: {
      typing: true,
      minDelayMs: 900,
      maxDelayMs: 8_000,
      msPerChar: 45,
      jitterRatio: 0.35,
      chatCooldownMs: 1_200,
    },
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    status: "queued" as const,
  };

  it("refuses to enqueue, so the caller falls back to a direct send", async () => {
    const { queue } = await loadModules(undefined);
    // `false` is the signal that the message was NOT accepted for queueing and
    // must be sent synchronously. Returning `true` here would drop the message.
    await expect(queue.enqueue(entry)).resolves.toBe(false);
  });

  it("reports zero depth", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.depth("s-1")).resolves.toBe(0);
  });

  it("claims nothing", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.claim("s-1", 10)).resolves.toEqual([]);
  });

  it("lists nothing", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.listIds("s-1")).resolves.toEqual([]);
  });

  it("peeks nothing", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.peek("m-1")).resolves.toBeNull();
  });

  it("recovers nothing", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.recoverProcessing()).resolves.toBe(0);
  });

  it("reports stats as disabled and unavailable", async () => {
    const { queue } = await loadModules(undefined);
    const stats = await queue.stats();
    expect(stats.enabled).toBe(false);
    expect(stats.available).toBe(false);
    expect(stats.sessions).toEqual([]);
    expect(stats.pending).toBe(0);
  });

  it("settle and requeue do not throw", async () => {
    const { queue } = await loadModules(undefined);
    await expect(queue.settle(entry, { ok: true })).resolves.toBeUndefined();
    await expect(queue.requeue(entry, "boom")).resolves.toBeUndefined();
    await expect(queue.purge("s-1")).resolves.toBeUndefined();
  });
});

describe("read-through cache without REDIS_URL", () => {
  it("always calls the loader", async () => {
    const { cache } = await loadModules(undefined);
    const loader = vi.fn(async () => ({ value: 42 }));
    await expect(cache.wrap("chats", "s-1", loader)).resolves.toEqual({ value: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("calls the loader every time rather than caching in-process", async () => {
    const { cache } = await loadModules(undefined);
    const loader = vi.fn(async () => [1, 2, 3]);
    await cache.wrap("chats", "s-1", loader);
    await cache.wrap("chats", "s-1", loader);
    // Two calls, two loads: with Redis off there is nowhere to cache, and
    // pretending otherwise would serve stale data from the wrong layer.
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("propagates loader errors, because a miss is not an error", async () => {
    const { cache } = await loadModules(undefined);
    const loader = vi.fn(async () => {
      throw new Error("database is down");
    });
    await expect(cache.wrap("chats", "s-1", loader)).rejects.toThrow("database is down");
  });

  it("invalidation is a no-op", async () => {
    const { cache } = await loadModules(undefined);
    await expect(cache.forget("chats", "s-1")).resolves.toBeUndefined();
    await expect(cache.forgetName("chats")).resolves.toBeUndefined();
    await expect(cache.invalidateMessageViews("s-1")).resolves.toBeUndefined();
    await expect(cache.invalidateSession("s-1")).resolves.toBeUndefined();
  });
});

describe("redis client with an unreachable server", () => {
  it("degrades to the fallback instead of throwing", async () => {
    // Port 1 is reserved and never listening, so the connection fails fast.
    const { client } = await loadModules("redis://127.0.0.1:1");

    expect(client.isEnabled()).toBe(true);
    await expect(client.getRedis()).resolves.toBeNull();
    await expect(client.withRedis(async () => "real", "fallback")).resolves.toBe("fallback");
  }, 15_000);

  it("reports queue stats as unavailable but enabled", async () => {
    const { queue } = await loadModules("redis://127.0.0.1:1");
    const stats = await queue.stats();
    // `enabled: true, available: false` is how the dashboard distinguishes
    // "not configured" from "configured but down".
    expect(stats.enabled).toBe(true);
    expect(stats.available).toBe(false);
  }, 15_000);

  it("enqueue reports failure so the caller sends directly", async () => {
    const { queue } = await loadModules("redis://127.0.0.1:1");
    const accepted = await queue.enqueue({
      id: "m-1",
      sessionId: "s-1",
      jid: "628@s.whatsapp.net",
      chatKey: "s-1:628@s.whatsapp.net",
      message: { conversation: "hi" },
      type: "text",
      preview: "hi",
      pacing: {
        typing: true,
        minDelayMs: 900,
        maxDelayMs: 8_000,
        msPerChar: 45,
        jitterRatio: 0.35,
        chatCooldownMs: 1_200,
      },
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      status: "queued",
    });
    expect(accepted).toBe(false);
  }, 15_000);
});

describe("key namespacing", () => {
  beforeEach(() => {
    process.env.REDIS_PREFIX = "custom";
  });

  afterEach(() => {
    delete process.env.REDIS_PREFIX;
  });

  it("uses the configured prefix", async () => {
    vi.resetModules();
    const { key } = await import("@/lib/redis/client");
    expect(key("cache", "sessions")).toBe("custom:cache:sessions");
  });
});
