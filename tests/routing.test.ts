import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { authStore } from "@/lib/auth/store";

/**
 * The router is written for a browser and reads `window.origin` while it is
 * being constructed — with plain property access, so a missing global throws
 * rather than falling back. Stubbing the one property it needs keeps this test
 * in the existing node environment instead of pulling in a DOM implementation
 * for a suite that never renders a component.
 */
(globalThis as unknown as { window?: unknown }).window ??= { origin: "http://localhost" };

/**
 * End-to-end check of the sign-in gate.
 *
 * This drives the real generated route tree through the real router — only the
 * history is in-memory instead of a DOM. That makes it possible to assert the
 * actual `beforeLoad` behaviour (including the redirect) without a browser, and
 * without adding a DOM test environment to a project that has none.
 *
 * `isServer: false` is essential: the router infers "server" from the absence
 * of `document` and would otherwise take the server load path, which never
 * matches routes or runs guards.
 */
function createTestRouter(initialPath: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    isServer: false,
  });
}

/** Loads the initial entry and resolves any redirect the guard throws. */
async function resolve(router: ReturnType<typeof createTestRouter>) {
  await router.load();
  return router.state.location;
}

describe("sign-in gate", () => {
  beforeEach(() => {
    authStore.signOut();
  });

  it("sends an anonymous visitor from the dashboard to the login page", async () => {
    const location = await resolve(createTestRouter("/"));

    expect(location.pathname).toBe("/login");
    expect(location.search).toMatchObject({ redirect: "/" });
  });

  it("remembers where the visitor was headed", async () => {
    const location = await resolve(createTestRouter("/sessions/abc"));

    expect(location.pathname).toBe("/login");
    expect(location.search).toMatchObject({ redirect: "/sessions/abc" });
  });

  it("renders the dashboard once signed in", async () => {
    authStore.signIn("admin", "admin");

    const location = await resolve(createTestRouter("/"));

    expect(location.pathname).toBe("/");
  });

  it("keeps a signed-in user out of the login page", async () => {
    authStore.signIn("admin", "admin");

    const location = await resolve(createTestRouter("/login"));

    expect(location.pathname).toBe("/");
  });

  it("returns to the login page after signing out", async () => {
    authStore.signIn("admin", "admin");
    const router = createTestRouter("/");
    await resolve(router);

    authStore.signOut();
    await router.invalidate();

    expect(router.state.location.pathname).toBe("/login");
  });
});
