import type { Context } from "hono";

/**
 * Parse the request body as JSON, returning an empty object on failure.
 *
 * Several endpoints treat the body as optional, so a parse failure or an empty
 * payload is not an error — it just means all fields are undefined.
 */
export async function safeJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Parse a query parameter into a bounded integer.
 *
 * Non-numeric or out-of-range values are clamped rather than rejected, so a
 * malformed `?limit=abc` degrades to the default instead of throwing.
 */
export function clampNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
