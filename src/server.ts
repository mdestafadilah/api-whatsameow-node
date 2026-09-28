import { serve } from "@hono/node-server";
import { env } from "./env";
import { ensureSchema } from "./database/db";
import { clients } from "./lib/whatsapp/clientManager";
import { registerMessageLogger } from "./lib/whatsapp/messageLogger";
import app from "./api";

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

  const server = serve(
    {
      fetch: app.fetch,
      port: env.port,
      hostname: env.host,
    },
    (info) => {
      console.log("");
      console.log("  whatsmeow-api");
      console.log(`  API      http://${env.host}:${info.port}/api`);
      console.log(`  Events   http://${env.host}:${info.port}/api/events`);
      console.log(`  Sessions ${env.sessionDir}`);
      console.log(`  Database ${env.databasePath}`);
      console.log(`  Auth     ${env.apiKey ? "API key required" : "disabled (dev only)"}`);
      console.log("");
    },
  );

  // Sessions are not auto-started: nothing should open a WhatsApp socket until
  // someone asks for one. Previously created sessions resume lazily via
  // `clients.ensure()` on the first request that references them.

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down...`);

    // Closing the socket first stops new work; then the Go subprocesses are
    // reaped so no orphaned binaries survive the parent.
    server.close();
    await clients.destroyAll();

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
