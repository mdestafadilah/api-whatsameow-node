/**
 * Typed accessors for Hono's route context.
 *
 * `c.req.param("id")` is typed as `string | undefined` because Hono cannot
 * infer params across a `route()` mount from the controller's side. Every
 * controller needs the session id, so the narrowing lives here once instead of
 * being repeated — and a missing param fails loudly rather than reaching the
 * database as `undefined`.
 */
import type { Context } from "hono";
import { badRequest } from "@/types/errors";

export function sessionId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw badRequest("A session id is required in the path.");
  return id;
}

/** Narrow an optional query result, returning `undefined` when absent. */
export function optionalQuery(c: Context, key: string): string | undefined {
  const value = c.req.query(key);
  return value === undefined || value === "" ? undefined : value;
}

/** Read a required query parameter or fail with a 400. */
export function requiredQuery(c: Context, key: string): string {
  const value = c.req.query(key);
  if (!value) throw badRequest(`\`${key}\` query parameter is required.`);
  return value;
}
