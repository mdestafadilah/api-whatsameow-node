import type { Context } from "hono";
import { sessionService } from "./service";
import {
  responseCreated,
  responseOK,
  responseBadRequest,
  responseNotFound,
} from "../utils/response";
import { ApiError } from "@/types/errors";
import { sessionId } from "../utils/context";

/**
 * Controllers stay thin: parse the request, call the service, shape the
 * response. Errors are thrown and rendered by the global handler in
 * `src/api/index.ts`.
 */
class SessionController {
  createSession = async (c: Context) => {
    const body = await safeJson(c);
    const session = await sessionService.create({
      label: body.label as string | undefined,
      phoneNumber: body.phoneNumber as string | undefined,
    });
    return responseCreated(c, "Session created successfully", session);
  };

  getSessions = async (c: Context) => {
    const sessions = await sessionService.getAll();
    return responseOK(c, "Sessions retrieved successfully", sessions);
  };

  getSessionById = async (c: Context) => {
    const session = await sessionService.getById(sessionId(c));
    return responseOK(c, "Session retrieved successfully", session);
  };

  getSessionStatus = async (c: Context) => {
    const status = await sessionService.getStatus(sessionId(c));
    return responseOK(c, "Session status retrieved successfully", status);
  };

  getSessionQr = async (c: Context) => {
    const qr = await sessionService.getQr(sessionId(c));
    return responseOK(c, "QR code generated successfully", qr);
  };

  requestPairCode = async (c: Context) => {
    const body = await safeJson(c);
    const phoneNumber = body.phoneNumber as string | undefined;

    if (!phoneNumber) {
      return responseBadRequest(c, "`phoneNumber` is required, including the country code.");
    }

    const result = await sessionService.requestPairCode(sessionId(c), phoneNumber);
    return responseOK(c, "Pairing code generated successfully", result);
  };

  connectSession = async (c: Context) => {
    const status = await sessionService.connect(sessionId(c));
    return responseOK(c, "Session connecting", status);
  };

  disconnectSession = async (c: Context) => {
    const status = await sessionService.disconnect(sessionId(c));
    return responseOK(c, "Session disconnected", status);
  };

  logoutSession = async (c: Context) => {
    const session = await sessionService.logout(sessionId(c));
    return responseOK(c, "Session logged out successfully", session);
  };

  removeSession = async (c: Context) => {
    const result = await sessionService.remove(sessionId(c));
    return responseOK(c, "Session removed successfully", result);
  };
}

/** Body is optional on several endpoints, so tolerate an empty payload. */
async function safeJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const sessionController = new SessionController();
export { ApiError, responseNotFound };
