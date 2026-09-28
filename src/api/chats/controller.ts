import type { Context } from "hono";
import { chatService } from "./service";
import { responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";
import { safeJson } from "../utils/body";

const VALID_PRESENCE = ["available", "unavailable"] as const;
const VALID_TYPING = ["composing", "paused"] as const;

class ChatController {
  setTyping = async (c: Context) => {
    const body = await safeJson(c);
    const chat = body.chat as string | undefined;
    const state = body.state as string | undefined;

    if (!chat) return responseBadRequest(c, "`chat` is required.");
    if (!state || !VALID_TYPING.includes(state as typeof VALID_TYPING[number])) {
      return responseBadRequest(c, "`state` must be `composing` or `paused`.");
    }

    const result = await chatService.setTyping(sessionId(c), chat, state as typeof VALID_TYPING[number]);
    return responseOK(c, "Typing state updated", result);
  };

  setPresence = async (c: Context) => {
    const body = await safeJson(c);
    const presence = body.presence as string | undefined;

    if (!presence || !VALID_PRESENCE.includes(presence as typeof VALID_PRESENCE[number])) {
      return responseBadRequest(c, "`presence` must be `available` or `unavailable`.");
    }

    const result = await chatService.setPresence(sessionId(c), presence as typeof VALID_PRESENCE[number]);
    return responseOK(c, "Presence updated", result);
  };

  subscribePresence = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;
    if (!jid) return responseBadRequest(c, "`jid` is required.");

    const result = await chatService.subscribePresence(sessionId(c), jid);
    return responseOK(c, "Subscribed to presence", result);
  };

  getPrivacy = async (c: Context) => {
    const settings = await chatService.getPrivacy(sessionId(c));
    return responseOK(c, "Privacy settings retrieved successfully", settings);
  };

  setPrivacy = async (c: Context) => {
    const body = await safeJson(c);
    const name = body.name as string | undefined;
    const value = body.value as string | undefined;

    if (!name || !value) {
      return responseBadRequest(c, "`name` and `value` are required.");
    }

    const settings = await chatService.setPrivacy(sessionId(c), name, value);
    return responseOK(c, "Privacy setting updated successfully", settings);
  };

  getStatusPrivacy = async (c: Context) => {
    const settings = await chatService.getStatusPrivacy(sessionId(c));
    return responseOK(c, "Status privacy retrieved successfully", settings);
  };

  getBlocklist = async (c: Context) => {
    const blocklist = await chatService.getBlocklist(sessionId(c));
    return responseOK(c, "Blocklist retrieved successfully", blocklist);
  };

  updateBlocklist = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;
    const action = body.action as string | undefined;

    if (!jid) return responseBadRequest(c, "`jid` is required.");
    if (action !== "block" && action !== "unblock") {
      return responseBadRequest(c, "`action` must be `block` or `unblock`.");
    }

    const blocklist = await chatService.updateBlocklist(sessionId(c), jid, action as "block" | "unblock");
    return responseOK(c, "Blocklist updated successfully", blocklist);
  };

  setDefaultDisappearingTimer = async (c: Context) => {
    const body = await safeJson(c);
    const seconds = body.seconds as number | undefined;

    if (typeof seconds !== "number" || seconds < 0) {
      return responseBadRequest(c, "`seconds` must be a non-negative number (0 disables).");
    }

    const result = await chatService.setDefaultDisappearingTimer(sessionId(c), seconds);
    return responseOK(c, "Default disappearing timer updated", result);
  };

  setDisappearingTimer = async (c: Context) => {
    const body = await safeJson(c);
    const chat = body.chat as string | undefined;
    const seconds = body.seconds as number | undefined;

    if (!chat) return responseBadRequest(c, "`chat` is required.");
    if (typeof seconds !== "number" || seconds < 0) {
      return responseBadRequest(c, "`seconds` must be a non-negative number (0 disables).");
    }

    const result = await chatService.setDisappearingTimer(sessionId(c), chat, seconds);
    return responseOK(c, "Disappearing timer updated", result);
  };

  setStatusMessage = async (c: Context) => {
    const body = await safeJson(c);
    const message = body.message as string | undefined;
    if (typeof message !== "string") return responseBadRequest(c, "`message` is required.");

    const result = await chatService.setStatusMessage(sessionId(c), message);
    return responseOK(c, "Status message updated", result);
  };

  getContactQr = async (c: Context) => {
    const revoke = c.req.query("revoke") === "true";
    const result = await chatService.getContactQr(sessionId(c), revoke);
    return responseOK(c, "Contact QR link retrieved successfully", result);
  };

  resolveContactQr = async (c: Context) => {
    const body = await safeJson(c);
    const code = body.code as string | undefined;
    if (!code) return responseBadRequest(c, "`code` is required.");

    const result = await chatService.resolveContactQr(sessionId(c), code);
    return responseOK(c, "Contact QR resolved successfully", result);
  };
}

export const chatController = new ChatController();
