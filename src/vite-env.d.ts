/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sent to the API as `X-API-Key` on every dashboard request. */
  readonly VITE_API_KEY?: string;
  /** Dashboard sign-in username. Falls back to `admin` when unset. */
  readonly VITE_DASHBOARD_USERNAME?: string;
  /**
   * Dashboard sign-in password. Falls back to `admin` when unset — which the
   * login screen warns about, since the fallback is public knowledge.
   */
  readonly VITE_DASHBOARD_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
