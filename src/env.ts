import "dotenv/config";
import path from "node:path";

/**
 * Single source of truth for runtime configuration.
 *
 * Everything is read once at import time so a malformed value fails loudly at
 * boot instead of surfacing as `undefined` deep inside a request.
 */
const num = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const root = process.cwd();
const resolveFromRoot = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(root, value);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",

  port: num(process.env.PORT, 3000),
  host: process.env.HOST ?? "127.0.0.1",

  /**
   * Empty means "auth disabled" — convenient locally, refused in production
   * by the guard below.
   */
  apiKey: process.env.API_KEY?.trim() || null,

  databasePath: resolveFromRoot(process.env.DATABASE_PATH ?? "./data/whatsmeow.db"),
  sessionDir: resolveFromRoot(process.env.SESSION_DIR ?? "./data/sessions"),

  whatsmeowCommandTimeout: num(process.env.WHATSMEOW_COMMAND_TIMEOUT, 30_000),
  pairCodeTtl: num(process.env.PAIR_CODE_TTL, 60),
} as const;

if (env.isProduction && !env.apiKey) {
  throw new Error(
    "API_KEY must be set when NODE_ENV=production. Refusing to start an unprotected WhatsApp API.",
  );
}
