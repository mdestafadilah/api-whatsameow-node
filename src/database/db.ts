import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * One SQLite connection for the process.
 *
 * The dashboard polls session status frequently, so opening a fresh connection
 * per request would thrash. WAL keeps reads from blocking on the status writes
 * the gateway performs.
 */
fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

const sqlite = new Database(env.databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;

/**
 * `drizzle-kit push` owns the schema in development, but booting the API against
 * a fresh clone would otherwise 500 on every request. Creating the tables here
 * makes `bun run dev` work immediately after `cp .env.example .env`.
 */
export function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      phone_number TEXT,
      jid TEXT,
      push_name TEXT,
      status TEXT NOT NULL DEFAULT 'creating',
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      connected_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      chat_jid TEXT NOT NULL,
      wa_message_id TEXT,
      direction TEXT NOT NULL DEFAULT 'outgoing',
      type TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '*',
      secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS messages_session_idx ON messages (session_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages (chat_jid, created_at);
  `);
}

export { schema };
