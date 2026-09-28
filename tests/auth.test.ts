import { beforeEach, describe, expect, it } from "vitest";
import { authStore } from "@/lib/auth/store";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * The auth store is a module singleton, so every case starts from a clean slate.
 * No `.env` is present in the test environment, which means the store falls back
 * to its documented `admin` / `admin` defaults.
 */
describe("authStore", () => {
  beforeEach(() => {
    authStore.signOut();
  });

  it("starts signed out", () => {
    expect(authStore.isAuthenticated()).toBe(false);
    expect(authStore.getSession()).toBeNull();
  });

  it("rejects a wrong password without signing in", () => {
    const result = authStore.signIn("admin", "not-the-password");

    expect(result.ok).toBe(false);
    expect(authStore.isAuthenticated()).toBe(false);
  });

  it("trims the username before comparing", () => {
    expect(authStore.signIn("  admin  ", "admin").ok).toBe(true);
    expect(authStore.getSession()?.username).toBe("admin");
  });

  it("stamps an expiry in the future", () => {
    authStore.signIn("admin", "admin");

    expect(authStore.getSession()?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns a stable snapshot until the session actually changes", () => {
    // `useSyncExternalStore` loops forever if the snapshot identity churns.
    authStore.signIn("admin", "admin");

    expect(authStore.getSession()).toBe(authStore.getSession());
  });

  it("notifies subscribers on sign in and sign out, and stops after unsubscribe", () => {
    const seen: Array<string | null> = [];
    const unsubscribe = authStore.subscribe(() => {
      seen.push(authStore.getSession()?.username ?? null);
    });

    authStore.signIn("admin", "admin");
    authStore.signOut();
    unsubscribe();

    authStore.signIn("admin", "admin");

    expect(seen).toEqual(["admin", null]);
  });
});

describe("safeRedirectPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeRedirectPath("/sessions/abc")).toBe("/sessions/abc");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeRedirectPath("//evil.example")).toBeUndefined();
    expect(safeRedirectPath("https://evil.example")).toBeUndefined();
  });

  it("rejects anything that is not a string", () => {
    expect(safeRedirectPath(undefined)).toBeUndefined();
    expect(safeRedirectPath(42)).toBeUndefined();
  });
});
