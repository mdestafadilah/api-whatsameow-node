import { useSyncExternalStore } from "react";
import { authStore } from "./store";

/**
 * Subscribes a component to the auth store.
 *
 * `getServerSnapshot` is passed as well so the hook is safe if the app is ever
 * rendered on the server; today it is only ever used client-side.
 */
export function useAuth() {
  const session = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSession,
    authStore.getSession,
  );

  return {
    session,
    isAuthenticated: session !== null,
    signIn: authStore.signIn,
    signOut: authStore.signOut,
  };
}
