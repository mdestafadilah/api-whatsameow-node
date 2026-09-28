import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PACING_PRESET,
  computeTypingDelay,
  isPacingPreset,
  resolvePacing,
  sendScheduler,
  sleep,
  type PacingConfig,
} from "@/lib/whatsapp/pacing";

/** `random` returning 0.5 yields no jitter, which makes the maths assertable. */
const noJitter = () => 0.5;

describe("isPacingPreset", () => {
  it("accepts every shipped preset", () => {
    for (const preset of ["off", "fast", "natural", "cautious"]) {
      expect(isPacingPreset(preset)).toBe(true);
    }
  });

  it("rejects anything else, including inherited object keys", () => {
    // A naive `in` check on a non-null object would happily match "toString".
    expect(isPacingPreset("instant")).toBe(false);
    expect(isPacingPreset(undefined)).toBe(false);
    expect(isPacingPreset(42)).toBe(false);
    expect(isPacingPreset("toString")).toBe(false);
  });
});

describe("resolvePacing", () => {
  it("falls back to the documented default when given nothing", () => {
    expect(resolvePacing()).toEqual(resolvePacing({ preset: DEFAULT_PACING_PRESET }));
  });

  it("rejects inherited keys instead of silently disabling pacing", () => {
    // Regression: `preset: "toString"` once passed an `in`-based guard, spread
    // Function.prototype.toString into the config, and produced a config whose
    // fields were all undefined — so pacing switched itself off and still
    // reported success. Rejecting the value keeps the default in force.
    const bogus = resolvePacing({ preset: "toString" as never });

    expect(bogus).toEqual(resolvePacing({ preset: DEFAULT_PACING_PRESET }));
    expect(bogus.typing).toBe(true);
    expect(computeTypingDelay("hello", bogus, noJitter)).toBeGreaterThan(0);
  });

  it("falls back to the default for an unknown preset instead of throwing", () => {
    expect(resolvePacing({ preset: "instant" as never })).toEqual(
      resolvePacing({ preset: DEFAULT_PACING_PRESET }),
    );
  });

  it("lets explicit fields override the preset", () => {
    const resolved = resolvePacing({ preset: "natural", maxDelayMs: 1_000, typing: false });
    expect(resolved.maxDelayMs).toBe(1_000);
    expect(resolved.typing).toBe(false);
    // Untouched keys must still come from the preset.
    expect(resolved.msPerChar).toBe(resolvePacing({ preset: "natural" }).msPerChar);
  });

  it("ignores undefined overrides rather than clobbering the preset", () => {
    const resolved = resolvePacing({ preset: "cautious", minDelayMs: undefined });
    expect(resolved.minDelayMs).toBe(resolvePacing({ preset: "cautious" }).minDelayMs);
  });

  it("returns a fresh object, so callers cannot mutate the preset table", () => {
    const first = resolvePacing({ preset: "fast" });
    first.maxDelayMs = 999_999;
    expect(resolvePacing({ preset: "fast" }).maxDelayMs).not.toBe(999_999);
  });
});

describe("computeTypingDelay", () => {
  const config = resolvePacing({ preset: "natural" });

  it("is zero when pacing is off, even for a long message", () => {
    const off = resolvePacing({ preset: "off" });
    expect(computeTypingDelay("a".repeat(500), off, noJitter)).toBe(0);
  });

  it("is zero when the config has no per-character rate", () => {
    const silent: PacingConfig = { ...config, msPerChar: 0 };
    expect(computeTypingDelay("hello", silent, noJitter)).toBe(0);
  });

  it("scales with message length", () => {
    const short = computeTypingDelay("hi", config, noJitter);
    const long = computeTypingDelay("h".repeat(60), config, noJitter);
    expect(long).toBeGreaterThan(short);
  });

  it("never exceeds maxDelayMs, so a wall of text cannot stall a request", () => {
    const delay = computeTypingDelay("x".repeat(100_000), config, noJitter);
    expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
  });

  it("stays near minDelayMs for an empty body", () => {
    const delay = computeTypingDelay("", config, noJitter);
    expect(delay).toBe(config.minDelayMs);
  });

  it("applies jitter in both directions", () => {
    // random() = 0 -> (0*2-1) = -1 -> factor 1 - jitterRatio.
    // random() = 1 -> (1*2-1) = +1 -> factor 1 + jitterRatio.
    const low = computeTypingDelay("hello world", config, () => 0);
    const high = computeTypingDelay("hello world", config, () => 1);
    const base = computeTypingDelay("hello world", config, noJitter);

    expect(low).toBeLessThan(base);
    expect(high).toBeGreaterThan(base);
  });

  it("never returns a negative delay", () => {
    // A jitterRatio above 1 would flip the sign without the floor.
    const wild: PacingConfig = { ...config, jitterRatio: 3 };
    expect(computeTypingDelay("hello", wild, () => 0)).toBeGreaterThanOrEqual(0);
  });

  it("returns an integer, because it is handed straight to setTimeout", () => {
    const delay = computeTypingDelay("some reasonably long message", config, () => 0.123456);
    expect(Number.isInteger(delay)).toBe(true);
  });
});

describe("SendScheduler", () => {
  it("runs tasks for the same chat strictly in order", async () => {
    const order: string[] = [];
    const slow = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          order.push("first");
          resolve();
        }, 20),
      );

    const a = sendScheduler.schedule("order-chat", 0, async () => {
      await slow();
      return "a";
    });
    const b = sendScheduler.schedule("order-chat", 0, async () => {
      order.push("second");
      return "b";
    });

    await expect(Promise.all([a, b])).resolves.toEqual(["a", "b"]);
    expect(order).toEqual(["first", "second"]);
    sendScheduler.forget("order-chat");
  });

  it("waits out the cooldown before the next send to the same chat", async () => {
    const start = Date.now();
    await sendScheduler.schedule("cooldown-chat", 0, async () => "one");
    await sendScheduler.schedule("cooldown-chat", 120, async () => "two");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(100);
    sendScheduler.forget("cooldown-chat");
  });

  it("does not make a different chat wait for another chat's cooldown", async () => {
    await sendScheduler.schedule("busy-chat", 0, async () => "one");

    const start = Date.now();
    await sendScheduler.schedule("free-chat", 5_000, async () => "two");

    expect(Date.now() - start).toBeLessThan(1_000);
    sendScheduler.forget("busy-chat");
    sendScheduler.forget("free-chat");
  });

  it("surfaces a rejection to its own caller", async () => {
    const failing = sendScheduler.schedule("reject-chat", 0, async () => {
      throw new Error("boom");
    });

    await expect(failing).rejects.toThrow("boom");
    sendScheduler.forget("reject-chat");
  });

  it("keeps the chain alive after a failure, so later sends still run", async () => {
    const failed = sendScheduler.schedule("recover-chat", 0, async () => {
      throw new Error("boom");
    });
    await expect(failed).rejects.toThrow("boom");

    // A rejected chain that was stored un-caught would poison this next call.
    await expect(
      sendScheduler.schedule("recover-chat", 0, async () => "recovered"),
    ).resolves.toBe("recovered");
    sendScheduler.forget("recover-chat");
  });

  it("forgetPrefix drops every chat belonging to one session", async () => {
    await sendScheduler.schedule("sess-a:1@s.whatsapp.net", 0, async () => 1);
    await sendScheduler.schedule("sess-a:2@s.whatsapp.net", 0, async () => 2);
    await sendScheduler.schedule("sess-b:1@s.whatsapp.net", 0, async () => 3);

    sendScheduler.forgetPrefix("sess-a:");

    const keys = ["sess-a:1@s.whatsapp.net", "sess-a:2@s.whatsapp.net"];
    for (const key of keys) {
      // Re-scheduling after a forget must not inherit the old cooldown.
      const start = Date.now();
      await sendScheduler.schedule(key, 0, async () => key);
      expect(Date.now() - start).toBeLessThan(500);
    }
    sendScheduler.forget("sess-b:1@s.whatsapp.net");
  });

  it("reports how many chats hold state", async () => {
    await sendScheduler.schedule("count-chat", 0, async () => 1);
    expect(sendScheduler.size()).toBeGreaterThanOrEqual(1);
    sendScheduler.forget("count-chat");
  });
});

describe("sleep", () => {
  it("resolves after roughly the requested delay", async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  it("does not use a real timer for zero", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    await sleep(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
