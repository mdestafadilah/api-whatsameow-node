import type { Context } from "hono";
import { miscService } from "./service";
import { responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";
import { safeJson, clampNumber } from "../utils/body";

class MiscController {
  getHealth = async (c: Context) => {
    const health = await miscService.getHealth();
    return responseOK(c, "Service is healthy", health);
  };

  /** Available send-pacing presets plus how many chats are currently throttled. */
  getPacingOptions = async (c: Context) => {
    return responseOK(c, "Pacing options retrieved successfully", miscService.getPacingOptions());
  };

  /** Queue depth and counters. Stays answerable when Redis is down. */
  getQueueStats = async (c: Context) => {
    return responseOK(c, "Queue stats retrieved successfully", await miscService.getQueueStats());
  };

  /** Queued messages for one session, oldest first. */
  getSessionQueue = async (c: Context) => {
    const limit = clampNumber(c.req.query("limit"), 50, 1, 200);
    return responseOK(
      c,
      "Session queue retrieved successfully",
      await miscService.getSessionQueue(sessionId(c), limit),
    );
  };

  /** Drain one session's queue on demand. */
  drainQueue = async (c: Context) => {
    const result = await miscService.drainQueue(sessionId(c));
    return responseOK(c, "Queue drained", result);
  };

  callMethod = async (c: Context) => {
    const body = await safeJson(c);
    const method = body.method as string | undefined;

    if (!method) return responseBadRequest(c, "`method` is required.");

    const result = await miscService.callMethod(
      sessionId(c),
      method,
      (body.args as Record<string, unknown>) ?? {},
    );

    return responseOK(c, `Method "${method}" executed successfully`, result);
  };

  generateMessageId = async (c: Context) => {
    const result = await miscService.generateMessageId(sessionId(c));
    return responseOK(c, "Message id generated", result);
  };

  uploadMedia = async (c: Context) => {
    const body = await safeJson(c);
    const path = body.path as string | undefined;

    if (!path) return responseBadRequest(c, "`path` is required.");

    const result = await miscService.uploadMedia(
      sessionId(c),
      path,
      (body.mediaType as string) ?? "document",
    );

    return responseOK(c, "Media uploaded successfully", result);
  };

  downloadMedia = async (c: Context) => {
    const body = await safeJson(c);
    const message = body.message as Record<string, unknown> | undefined;

    if (!message) {
      return responseBadRequest(c, "`message` must be a proto-shaped message object.");
    }

    const result = await miscService.downloadMedia(sessionId(c), message);
    return responseOK(c, "Media downloaded successfully", result);
  };

  /** Raw SSE passthrough — see `miscService.streamEvents`. */
  streamEvents = async (c: Context) => {
    return miscService.streamEvents(
      c as unknown as {
        req: { raw: Request; query: (key: string) => string | undefined };
      },
    );
  };
}

export const miscController = new MiscController();
