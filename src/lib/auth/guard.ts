import { redirect } from "@tanstack/react-router";
import { authStore } from "./store";

/**
 * `beforeLoad` guard for every route that must not render before sign-in.
 *
 * The current URL travels along as `?redirect=` so the user lands where they
 * were headed after signing in, instead of always on the dashboard root.
 */
export function requireAuth({ location }: { location: { href: string } }): void {
  if (authStore.isAuthenticated()) return;

  throw redirect({
    to: "/login",
    search: { redirect: location.href },
  });
}
