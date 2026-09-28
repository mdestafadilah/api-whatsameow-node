import type { Context } from "hono";
import { chatService } from "./service";
import { responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";

const VALID_PRESENCE = ["available", "unavailable"] as const;
const VALID_TYPING = ["composing", "paused"] as const;

class ChatController {
  setTyping = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      chat?: string;
      state?: "composing" | "paused";
    };

    if (!body.chat) return responseBadRequest(c, "`chat` is required.");
    if (!body.state || !VALID_TYPING.includes(body.state)) {
      return responseBadRequest(c, "`state` must be `composing` or `paused`.");
    }

    const result = await chatService.setTyping(sessionId(c), body.chat, body.state);
    return responseOK(c, "Typing state updated", result);
  };

  setPresence = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      presence?: "available" | "unavailable";
    };

    if (!body.presence || !VALID_PRESENCE.includes(body.presence)) {
      return responseBadRequest(c, "`presence` must be `available` or `unavailable`.");
    }

    const result = await chatService.setPresence(sessionId(c), body.presence);
    return responseOK(c, "Presence updated", result);
  };

  subscribePresence = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { jid?: string };
    if (!body.jid) return responseBadRequest(c, "`jid` is required.");

    const result = await chatService.subscribePresence(sessionId(c), body.jid);
    return responseOK(c, "Subscribed to presence", result);
  };

  getPrivacy = async (c: Context) => {
    const settings = await chatService.getPrivacy(sessionId(c));
    return responseOK(c, "Privacy settings retrieved successfully", settings);
  };

  setPrivacy = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; value?: string };

    if (!body.name || !body.value) {
      return responseBadRequest(c, "`name` and `value` are required.");
    }

    const settings = await chatService.setPrivacy(sessionId(c), body.name, body.value);
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
    const body = (await c.req.json().catch(() => ({}))) as {
      jid?: string;
      action?: "block" | "unblock";
    };

    if (!body.jid) return responseBadRequest(c, "`jid` is required.");
    if (body.action !== "block" && body.action !== "unblock") {
      return responseBadRequest(c, "`action` must be `block` or `unblock`.");
    }

    const blocklist = await chatService.updateBlocklist(sessionId(c), body.jid, body.action);
    return responseOK(c, "Blocklist updated successfully", blocklist);
  };

  setDefaultDisappearingTimer = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { seconds?: number };

    if (typeof body.seconds !== "number" || body.seconds < 0) {
      return responseBadRequest(c, "`seconds` must be a non-negative number (0 disables).");
    }

    const result = await chatService.setDefaultDisappearingTimer(sessionId(c), body.seconds);
    return responseOK(c, "Default disappearing timer updated", result);
  };

  setDisappearingTimer = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { chat?: string; seconds?: number };

    if (!body.chat) return responseBadRequest(c, "`chat` is required.");
    if (typeof body.seconds !== "number" || body.seconds < 0) {
      return responseBadRequest(c, "`seconds` must be a non-negative number (0 disables).");
    }

    const result = await chatService.setDisappearingTimer(
      sessionId(c),
      body.chat,
      body.seconds,
    );

    return responseOK(c, "Disappearing timer updated", result);
  };

  setStatusMessage = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    if (typeof body.message !== "string") return responseBadRequest(c, "`message` is required.");

    const result = await chatService.setStatusMessage(sessionId(c), body.message);
    return responseOK(c, "Status message updated", result);
  };

  getContactQr = async (c: Context) => {
    const revoke = c.req.query("revoke") === "true";
    const result = await chatService.getContactQr(sessionId(c), revoke);
    return responseOK(c, "Contact QR link retrieved successfully", result);
  };

  resolveContactQr = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { code?: string };
    if (!body.code) return responseBadRequest(c, "`code` is required.");

    const result = await chatService.resolveContactQr(sessionId(c), body.code);
    return responseOK(c, "Contact QR resolved successfully", result);
  };
}

export const chatController = new ChatController();
