/**
 * Post-login destination sanitising.
 *
 * Lives outside the login route so it can be unit-tested without dragging the
 * router and JSX into the test environment.
 */

/**
 * Accepts only same-origin absolute paths.
 *
 * Without this check, `?redirect=https://evil.example` — or the
 * protocol-relative `//evil.example`, which browsers read as an absolute URL —
 * would turn the login form into an open redirect.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
