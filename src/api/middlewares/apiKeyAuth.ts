import type { Context, Next } from "hono";
import { env } from "@/env";
import { responseUnauthorized } from "../utils/response";

/**
 * Shared-secret auth.
 *
 * An empty `API_KEY` disables the check, which is what you want for a local
 * dashboard; `src/env.ts` refuses to boot in production without one.
 */
export const apiKeyAuth = async (c: Context, next: Next) => {
  if (!env.apiKey) {
    return next();
  }

  const header = c.req.header("X-API-Key") ?? c.req.header("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();

  // Constant-time compare: lengths are compared first because timingSafeEqual
  // throws on mismatched buffers.
  if (!timingSafeEqual(provided, env.apiKey)) {
    return responseUnauthorized(c, "Missing or invalid API key.");
  }

  return next();
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
