import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * Root renders nothing but the outlet.
 *
 * The dashboard chrome deliberately lives in the `_authenticated` layout: the
 * login screen must render standalone, without a nav bar the user cannot use
 * yet. Anything that should appear on *every* page — devtools, providers, error
 * boundaries — belongs here instead.
 */
function RootLayout() {
  return (
    <>
      <Outlet />
      <TanStackRouterDevtools />
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}
