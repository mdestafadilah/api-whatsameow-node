/**
 * Tiny `classnames` replacement.
 *
 * The project only ever needs "join these strings, drop the falsy ones", so a
 * dependency would be overkill. Kept here rather than inlined at each call site
 * so conditional Tailwind classes read the same way everywhere.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
