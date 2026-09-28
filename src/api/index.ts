import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { ApiError } from "@/types/errors";
import { responseInternalError, sendResponse } from "./utils/response";
import { apiKeyAuth } from "./middlewares/apiKeyAuth";
import { env } from "@/env";

import sessionRoute from "./sessions/route";
import messageRoute from "./messages/route";
import chatRoute from "./chats/route";
import contactRoute from "./contacts/route";
import groupRoute from "./groups/route";
import miscRoute from "./misc/route";
import { miscService } from "./misc/service";
import { miscController } from "./misc/controller";

const app = new Hono().basePath("/api");

app.use("*", requestId());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // The Vite dev server runs on a different port; in production the client
      // is served by this same process.
      if (!origin) return "*";
      if (!env.isProduction) return origin;
      return origin;
    },
    allowHeaders: ["Content-Type", "X-API-Key", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use("*", logger());

// Health and the event stream stay reachable without a key so uptime checks and
// the dashboard's connection indicator work before auth is configured.
app.get("/name", (c) => sendResponse(c, 200, "Success", { name: "whatsmeow-api" }));

app.use("*", apiKeyAuth);

/**
 * Register the literal health path *before* the session router.
 *
 * `/sessions/:id` would otherwise capture `/sessions/health` and treat "health"
 * as a session id. Hono matches in registration order, so the specific path
 * must come first.
 */
app.get("/sessions/health", (c) => {
  return miscController.getHealth(c);
});

app.route("/sessions", sessionRoute);

// Send-pacing presets are a property of the server, not of any session, so they
// are mounted at the root rather than under `/sessions/:id`.
app.get("/pacing", (c) => {
  return miscController.getPacingOptions(c);
});

// Message and chat routes are per-session, matching the REST shape the
// dashboard uses (`/api/sessions/:id/messages`).
app.route("/sessions/:id/messages", messageRoute);
app.route("/sessions/:id/chats", chatRoute);
app.route("/sessions/:id/contacts", contactRoute);
app.route("/sessions/:id/groups", groupRoute);
app.route("/sessions/:id/misc", miscRoute);

app.get("/events", (c) => {
  return miscService.streamEvents(
    c as unknown as { req: { raw: Request; query: (key: string) => string | undefined } },
  );
});

app.notFound((c) => sendResponse(c, 404, "The requested endpoint does not exist."));

/**
 * Terminal error handler.
 *
 * Anything thrown by a service is rendered in the same envelope as a success,
 * so a client can read `success` without branching on the HTTP layer.
 */
app.onError((error, c) => {
  if (error instanceof ApiError) {
    return sendResponse(
      c,
      error.status as 400,
      error.message,
      error.details !== undefined ? { code: error.code, details: error.details } : { code: error.code },
    );
  }

  console.error("[api] Unhandled error:", error);

  // do not leak internals in production
  return responseInternalError(
    c,
    env.isProduction ? "Internal server error" : error.message,
  );
});

export default app;
export type AppType = typeof app;
