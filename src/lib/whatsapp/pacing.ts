/**
 * Human-like send pacing.
 *
 * WhatsApp rate-limits unofficial clients and can ban an account that looks
 * automated. Two cheap signals make a client look human:
 *
 *   1. A typing indicator appears, then the message arrives after a pause
 *      roughly proportional to how long a person would need to type it.
 *   2. Messages to the same chat are spaced out, rather than fired back to back.
 *
 * This module owns both. It is deliberately dependency-free and clock-injectable
 * so the timing maths can be unit-tested without real delays.
 */

export type PacingPreset = "off" | "fast" | "natural" | "cautious";

export type PacingConfig = {
  /**
   * Whether the "typing…" indicator is sent before the message.
   * Purely cosmetic from WhatsApp's side, but it is what a real client does.
   */
  typing: boolean;
  /** Pause before sending, derived from message length (ms). */
  minDelayMs: number;
  maxDelayMs: number;
  /** Milliseconds of simulated typing per character. */
  msPerChar: number;
  /** Random jitter added on top so the timing is not suspiciously uniform. */
  jitterRatio: number;
  /** Minimum gap between two consecutive sends to the SAME chat (ms). */
  chatCooldownMs: number;
};

/** Resolved config plus the caller's overrides. */
export type PacingOverrides = Partial<PacingConfig> & { preset?: PacingPreset };

const PRESETS: Record<PacingPreset, PacingConfig> = {
  /** No typing, no delay. Only for tests and trusted internal automations. */
  off: {
    typing: false,
    minDelayMs: 0,
    maxDelayMs: 0,
    msPerChar: 0,
    jitterRatio: 0,
    chatCooldownMs: 0,
  },
  /** Snappy, still spaced. Good for support lines where latency matters. */
  fast: {
    typing: true,
    minDelayMs: 400,
    maxDelayMs: 2_500,
    msPerChar: 12,
    jitterRatio: 0.25,
    chatCooldownMs: 250,
  },
  /**
   * Default. Roughly 40-70 wpm typing, capped so a long paragraph does not turn
   * into a multi-minute request.
   */
  natural: {
    typing: true,
    minDelayMs: 900,
    maxDelayMs: 8_000,
    msPerChar: 45,
    jitterRatio: 0.35,
    chatCooldownMs: 1_200,
  },
  /** Heaviest spacing — for cold outreach to numbers that have never replied. */
  cautious: {
    typing: true,
    minDelayMs: 2_500,
    maxDelayMs: 18_000,
    msPerChar: 80,
    jitterRatio: 0.5,
    chatCooldownMs: 4_000,
  },
};

export const DEFAULT_PACING_PRESET: PacingPreset = "natural";

export function isPacingPreset(value: unknown): value is PacingPreset {
  // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so "toString" or
  // "constructor" would be accepted and then spread into a config with no
  // numeric fields — silently disabling pacing instead of rejecting the input.
  return typeof value === "string" && Object.hasOwn(PRESETS, value);
}

export function resolvePacing(overrides: PacingOverrides = {}): PacingConfig {
  const preset = isPacingPreset(overrides.preset) ? overrides.preset : DEFAULT_PACING_PRESET;
  const base = PRESETS[preset];

  // Explicit fields win over the preset; `undefined` must not clobber a preset
  // value, so only defined keys are copied.
  const resolved: PacingConfig = { ...base };
  for (const key of Object.keys(base) as (keyof PacingConfig)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      (resolved[key] as number | boolean) = value as number | boolean;
    }
  }

  return resolved;
}

/**
 * How long a human would plausibly spend typing this text.
 *
 * Length is measured on the message body when there is one, otherwise on the
 * preview (a caption or filename) so media sends still get a sane pause.
 */
export function computeTypingDelay(
  text: string,
  config: PacingConfig,
  random: () => number = Math.random,
): number {
  if (config.msPerChar <= 0 || config.maxDelayMs <= 0) return 0;

  const raw = config.minDelayMs + text.length * config.msPerChar;
  const capped = Math.min(raw, config.maxDelayMs);

  // Symmetric jitter: a real person is not consistently slower or faster.
  const jitter = 1 + (random() * 2 - 1) * config.jitterRatio;

  return Math.max(0, Math.round(capped * jitter));
}

/**
 * Serialises sends per chat so the cooldown is enforced, not just suggested.
 *
 * Without this, two concurrent requests to the same chat would each measure a
 * cooldown independently and fire simultaneously — which is exactly the
 * behaviour the feature exists to avoid.
 */
class SendScheduler {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly lastSentAt = new Map<string, number>();

  /**
   * Run `task` after any in-flight send to the same chat has finished and the
   * cooldown has elapsed.
   */
  async schedule<T>(chatKey: string, cooldownMs: number, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(chatKey) ?? Promise.resolve();

    const run = previous
      .catch(() => undefined)
      .then(async () => {
        if (cooldownMs > 0) {
          const last = this.lastSentAt.get(chatKey);
          if (last !== undefined) {
            const elapsed = Date.now() - last;
            const remaining = cooldownMs - elapsed;
            if (remaining > 0) await sleep(remaining);
          }
        }

        try {
          return await task();
        } finally {
          this.lastSentAt.set(chatKey, Date.now());
        }
      });

    // The chain must not reject, or every later send to this chat would inherit
    // the failure. Callers still see the real rejection through `run`.
    this.chains.set(
      chatKey,
      run.catch(() => undefined),
    );

    return run;
  }

  /** Drop bookkeeping for a chat (used when a session is deleted). */
  forget(chatKey: string): void {
    this.chains.delete(chatKey);
    this.lastSentAt.delete(chatKey);
  }

  forgetPrefix(prefix: string): void {
    for (const key of [...this.chains.keys()]) {
      if (key.startsWith(prefix)) this.forget(key);
    }
  }

  /** Diagnostics for the dashboard: how many chats currently hold state. */
  size(): number {
    return this.chains.size;
  }
}

export const sendScheduler = new SendScheduler();

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { PRESETS };
