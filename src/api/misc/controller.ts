import type { Context } from "hono";
import { miscService } from "./service";
import { responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";

class MiscController {
  getHealth = async (c: Context) => {
    const health = await miscService.getHealth();
    return responseOK(c, "Service is healthy", health);
  };

  callMethod = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      method?: string;
      args?: Record<string, unknown>;
    };

    if (!body.method) return responseBadRequest(c, "`method` is required.");

    const result = await miscService.callMethod(
      sessionId(c),
      body.method,
      body.args ?? {},
    );

    return responseOK(c, `Method "${body.method}" executed successfully`, result);
  };

  generateMessageId = async (c: Context) => {
    const result = await miscService.generateMessageId(sessionId(c));
    return responseOK(c, "Message id generated", result);
  };

  uploadMedia = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      path?: string;
      mediaType?: string;
    };

    if (!body.path) return responseBadRequest(c, "`path` is required.");

    const result = await miscService.uploadMedia(
      sessionId(c),
      body.path,
      body.mediaType ?? "document",
    );

    return responseOK(c, "Media uploaded successfully", result);
  };

  downloadMedia = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: Record<string, unknown> };

    if (!body.message) {
      return responseBadRequest(c, "`message` must be a proto-shaped message object.");
    }

    const result = await miscService.downloadMedia(sessionId(c), body.message);
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
