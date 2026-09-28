import { createRequire } from "node:module";

/**
 * One SQLite handle, whichever runtime we are on.
 *
 * Why this file exists: `better-sqlite3` is a native addon, and it is the single
 * reason this project could not run under Bun — loading it panics the Bun
 * process with an N-API assertion failure (and on Windows it does not even
 * build, because node-gyp needs a Windows SDK). Both runtimes we care about
 * ship SQLite themselves:
 *
 *   Bun        → `bun:sqlite`
 *   Node 22.5+ → `node:sqlite`
 *
 * Both expose `exec()` / `prepare()` with `run()`/`get()`/`all()`, which is all
 * this project needs, so the same code path serves both and the native
 * dependency disappears entirely.
 *
 * The lookup goes through `createRequire` rather than a static `import` on
 * purpose: a literal `import "bun:sqlite"` would be unresolvable under Node (and
 * vice versa), and esbuild would refuse to bundle it.
 */
const nodeRequire = createRequire(import.meta.url);

export type SqliteDriver = "bun:sqlite" | "node:sqlite" | "better-sqlite3";

/** Minimal surface shared by every supported driver. */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type DatabaseConstructor = new (path: string) => SqliteDatabase;

/** `process.versions.bun` is the only reliable Bun marker that needs no types. */
const isBun = typeof (process.versions as Record<string, string | undefined>).bun === "string";

function loadBun(): DatabaseConstructor {
  const mod = nodeRequire("bun:sqlite") as { Database: DatabaseConstructor };
  return mod.Database;
}

function loadNode(): DatabaseConstructor {
  const mod = nodeRequire("node:sqlite") as { DatabaseSync: DatabaseConstructor };
  return mod.DatabaseSync;
}

/**
 * Last resort for runtimes with neither built-in — Node 20/21, or a Node build
 * with SQLite stripped. Kept optional so the happy path needs nothing installed.
 */
function loadBetterSqlite3(): DatabaseConstructor {
  return nodeRequire("better-sqlite3") as DatabaseConstructor;
}

function hasBuiltinNodeSqlite(): boolean {
  try {
    nodeRequire("node:sqlite");
    return true;
  } catch {
    return false;
  }
}

/** Which engine the current process is actually talking to. */
let activeDriver: SqliteDriver = "node:sqlite";

/**
 * Open a database file, creating it when missing.
 *
 * The driver is chosen once, at first call, and reported by `driverName()` so
 * `/api/health` and the boot banner can tell you which engine answered.
 */
export function openDatabase(file: string): SqliteDatabase {
  let Database: DatabaseConstructor;
  let driver: SqliteDriver;

  if (isBun) {
    Database = loadBun();
    driver = "bun:sqlite";
  } else if (hasBuiltinNodeSqlite()) {
    Database = loadNode();
    driver = "node:sqlite";
  } else {
    Database = loadBetterSqlite3();
    driver = "better-sqlite3";
  }

  activeDriver = driver;
  return new Database(file);
}

export function driverName(): SqliteDriver {
  return activeDriver;
}
