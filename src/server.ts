import { serve } from "@hono/node-server";
import { env } from "./env";
import { driverName, ensureSchema } from "./database/db";
import { clients } from "./lib/whatsapp/clientManager";
import { registerMessageLogger } from "./lib/whatsapp/messageLogger";
import { bus } from "./lib/whatsapp/eventBus";
import * as queueWorker from "./lib/redis/queueWorker";
import { recoverProcessing } from "./lib/redis/messageQueue";
import { closeRedis, isEnabled as redisEnabled, isReady as redisReady } from "./lib/redis/client";
import app from "./api";

/** How often to sweep the queue for sessions with pending work. */
const QUEUE_SWEEP_MS = 5_000;

/** `process.versions.bun` is set by Bun and by nothing else we run on. */
const isBun = typeof (process.versions as Record<string, string | undefined>).bun === "string";

/** The two adapters differ in how they stop, so both are normalised to this. */
type ServerHandle = {
  port: number;
  stop: () => void;
};

/**
 * Start the HTTP listener on whichever runtime we are on.
 *
 * Bun gets its own `Bun.serve`. Going through `@hono/node-server` there would
 * mean routing every request through Bun's `node:http` compatibility layer,
 * which is slower and is not what the streaming endpoints are written against.
 * Node keeps `@hono/node-server`, as before.
 */
function startServer(onListen: (info: { port: number }) => void): ServerHandle {
  if (isBun) {
    const bun = (globalThis as { Bun?: { serve: (options: Record<string, unknown>) => {
      port: number;
      stop: (closeActiveConnections?: boolean) => void;
    } } }).Bun;

    if (!bun) {
      throw new Error("Running under Bun, but the global `Bun` object is unavailable.");
    }

    const server = bun.serve({
      fetch: app.fetch,
      port: env.port,
      hostname: env.host,
    });

    onListen({ port: server.port });
    return { port: server.port, stop: () => server.stop(true) };
  }

  const server = serve(
    { fetch: app.fetch, port: env.port, hostname: env.host },
    (info) => onListen({ port: info.port }),
  );

  return { port: env.port, stop: () => server.close() };
}

/**
 * Boot the API.
 *
 * Startup order matters: the schema must exist before any request can touch the
 * database, and the message logger must be attached before the first client
 * connects or early messages are dropped on the floor.
 */
async function main() {
  ensureSchema();
  registerMessageLogger();

  const server = startServer((info) => {
    console.log("");
    console.log("  whatsmeow-api");
    console.log(`  Runtime  ${isBun ? `Bun ${process.versions.bun}` : `Node ${process.version}`}`);
    console.log(`  API      http://${env.host}:${info.port}/api`);
    console.log(`  Events   http://${env.host}:${info.port}/api/events`);
    console.log(`  Sessions ${env.sessionDir}`);
    console.log(`  Database ${env.databasePath} (${driverName()})`);
    console.log(`  Auth     ${env.apiKey ? "API key required" : "disabled (dev only)"}`);
    console.log(
      `  Redis    ${env.redisUrl ? (redisReady() ? "connected" : "configured") : "disabled"}`,
    );
    console.log("");
  });

  // Sessions are not auto-started: nothing should open a WhatsApp socket until
  // someone asks for one. Previously created sessions resume lazily via
  // `clients.ensure()` on the first request that references them.

  // ── Redis queue ──────────────────────────────────────────────────────
  // A previous process may have died with messages mid-flight. Nothing else
  // would ever pick those up, so they are returned to their queues at boot.
  if (redisEnabled()) {
    const recovered = await recoverProcessing();
    if (recovered > 0) {
      console.log(`[queue] recovered ${recovered} in-flight message(s) after restart`);
    }

    // Drain whenever a session finishes connecting — its queue may have been
    // waiting for exactly that.
    bus.onEvent("session:connected", (payload) => {
      const sessionId = payload.sessionId;
      void queueWorker.drain(sessionId).catch(() => undefined);
    });

    // Safety net. A queued message can become drainable without an event (a
    // retry backoff expiring, or a session that was already connected when the
    // message arrived), so something has to look periodically.
    const sweep = setInterval(() => {
      void queueWorker.drainAll().catch(() => undefined);
    }, QUEUE_SWEEP_MS);

    // Never hold the process open just because of the sweep timer.
    sweep.unref();
  }

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down...`);

    // Closing the socket first stops new work; then the Go subprocesses are
    // reaped so no orphaned binaries survive the parent.
    server.stop();
    await clients.destroyAll();
    await closeRedis();

    console.log("[server] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[server] Failed to start:", error);
  process.exit(1);
});
