import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { env } from "@/env";
import { driverName, openDatabase, type SqliteDatabase } from "./sqlite";
import * as schema from "./schema";

/**
 * One SQLite connection for the process.
 *
 * The dashboard polls session status frequently, so opening a fresh connection
 * per request would thrash. WAL keeps reads from blocking on the status writes
 * the gateway performs.
 */
fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

const sqlite: SqliteDatabase = openDatabase(env.databasePath);

// Spoken as `exec`, not `db.pragma()`, because only better-sqlite3 has a
// `pragma()` method — the built-in drivers do not.
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec("PRAGMA busy_timeout = 5000");

/**
 * Drizzle bound through `sqlite-proxy`.
 *
 * The built-in drivers have no dedicated Drizzle adapter, so we hand Drizzle a
 * callback instead of a driver object. Two details matter:
 *
 * - **Rows are positional arrays, not objects.** Drizzle maps a returned row by
 *   column index (`mapResultRow` reads `row[columnIndex]`), so a row shaped
 *   `{ id, label }` would decode to all-`undefined`. Every row is therefore
 *   flattened to its values in SQL column order.
 * - **`get` returns a single row, not a one-element array.** The proxy session
 *   treats `rows` as *the* row, which is why the two read methods differ below.
 */
export const db = drizzle(
  async (sqlText, params, method) => {
    const statement = sqlite.prepare(sqlText);

    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }

    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === "get" ? rows[0] : rows };
  },
  { schema },
);

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

/** Close the connection. Used on shutdown and by the verification scripts. */
export function closeDatabase(): void {
  sqlite.close();
}

export { schema };
export { driverName, sqlite };
