/**
 * Dashboard sign-in state.
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 * This is a **client-side gate**. Credentials come from build-time env vars and
 * the resulting "session" is a timestamped record in `localStorage` — it stops
 * someone from casually opening the dashboard, but it is not a security
 * boundary. Anyone who can load the bundle can read the password out of it, and
 * the REST API stays reachable regardless (by design: it is protected by
 * `API_KEY`, not by this).
 *
 * That is the deliberate trade-off requested: "biarkan api" — the API layer is
 * untouched. If the dashboard ever needs to be genuinely protected, the check
 * has to move server-side (an auth endpoint that sets an HttpOnly cookie, with
 * the dashboard routes reading that cookie).
 *
 * ── Why a module-level store instead of React context ───────────────────────
 * TanStack Router runs `beforeLoad` guards outside the React tree, so the guard
 * cannot call `useContext`. A plain observable store works in both places:
 * `beforeLoad` reads it synchronously, and components subscribe via
 * `useSyncExternalStore` (see `useAuth`).
 *
 * ── Why storage access is defensive ─────────────────────────────────────────
 * The module is also imported by tests and by any non-browser context, where
 * `localStorage` may be missing or throw on access. Every read and write goes
 * through `getStorage()` and is allowed to fail: losing persistence is fine,
 * crashing the app is not.
 */
const STORAGE_KEY = "whatsmeow.dashboard.session";

/** How long a sign-in stays valid before the user has to enter it again. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";

export type AuthSession = {
  username: string;
  /** Epoch milliseconds after which this session is no longer valid. */
  expiresAt: number;
};

export type SignInResult = { ok: true; session: AuthSession } | { ok: false; error: string };

const configuredUsername = import.meta.env.VITE_DASHBOARD_USERNAME?.trim() || DEFAULT_USERNAME;
const configuredPassword = import.meta.env.VITE_DASHBOARD_PASSWORD || DEFAULT_PASSWORD;

/**
 * True when no `VITE_DASHBOARD_PASSWORD` was supplied at build time, i.e. the
 * dashboard is sitting behind `admin` / `admin`. The login screen shows a
 * warning banner in that case so a forgotten password is never a silent hole.
 */
export const isUsingDefaultCredentials = !import.meta.env.VITE_DASHBOARD_PASSWORD;

/**
 * The slice of the Web Storage API this module uses.
 *
 * Declared structurally rather than as the DOM `Storage` type, so the file
 * type-checks in a Node-only program too.
 */
type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** `localStorage` when it exists and can be touched, otherwise null. */
function getStorage(): StorageLike | null {
  try {
    return (globalThis as unknown as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    // Merely reading the property throws when storage is blocked by policy.
    return null;
  }
}

/** Reads the persisted session, discarding anything malformed or expired. */
function readStoredSession(): AuthSession | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof parsed.username !== "string" || typeof parsed.expiresAt !== "number") return null;

    if (parsed.expiresAt <= Date.now()) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    return { username: parsed.username, expiresAt: parsed.expiresAt };
  } catch {
    // Corrupted value, or a value another tab rewrote mid-flight.
    return null;
  }
}

function writeStoredSession(session: AuthSession | null): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    if (session) {
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Quota exceeded or blocked — the in-memory session still works this tab.
  }
}

let currentSession: AuthSession | null = readStoredSession();

const listeners = new Set<() => void>();

function commit(next: AuthSession | null): void {
  currentSession = next;
  writeStoredSession(next);
  for (const listener of listeners) listener();
}

export const authStore = {
  /** `useSyncExternalStore` contract: returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Snapshot getter.
   *
   * Returns the same object reference until the session actually changes, which
   * is what `useSyncExternalStore` needs to avoid an infinite render loop.
   */
  getSession(): AuthSession | null {
    return currentSession;
  },

  isAuthenticated(): boolean {
    return currentSession !== null && currentSession.expiresAt > Date.now();
  },

  signIn(username: string, password: string): SignInResult {
    const trimmed = username.trim();

    if (trimmed !== configuredUsername || password !== configuredPassword) {
      // One generic message: never reveal which half was wrong.
      return { ok: false, error: "Username atau password salah." };
    }

    const session: AuthSession = { username: trimmed, expiresAt: Date.now() + SESSION_TTL_MS };
    commit(session);
    return { ok: true, session };
  },

  signOut(): void {
    commit(null);
  },
};
