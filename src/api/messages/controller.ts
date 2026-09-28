import type { Context } from "hono";
import { messageService } from "./service";
import { responseCreated, responseNotFound, responseOK, responsePaginated } from "../utils/response";
import { sessionId } from "../utils/context";
import type { SendBody } from "@/lib/whatsapp/messages";

class MessageController {
  /** Send a message from a specific session. */
  sendMessage = async (c: Context) => {
    const body = (await c.req.json()) as SendBody;
    const result = await messageService.send(sessionId(c), body);
    return responseCreated(c, "Message sent successfully", result);
  };

  getMessages = async (c: Context) => {
    const limit = clampNumber(c.req.query("limit"), 50, 1, 200);
    const offset = clampNumber(c.req.query("offset"), 0, 0, 100_000);

    const { items, total } = await messageService.list({
      sessionId: sessionId(c),
      chatJid: c.req.query("chat"),
      direction: c.req.query("direction"),
      type: c.req.query("type"),
      search: c.req.query("search"),
      limit,
      offset,
    });

    return responsePaginated(c, "Messages retrieved successfully", items, limit, offset, total);
  };

  /** Distinct chats this session has traffic with. */
  getChats = async (c: Context) => {
    const limit = clampNumber(c.req.query("limit"), 50, 1, 200);
    const chats = await messageService.listChats(sessionId(c), limit);
    return responseOK(c, "Chats retrieved successfully", chats);
  };

  markRead = async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      ids?: string[];
      chat?: string;
    };

    const result = await messageService.markRead(
      sessionId(c),
      Array.isArray(body.ids) ? body.ids : [],
      body.chat,
    );

    return responseOK(c, "Messages marked as read", result);
  };

  reactToMessage = async (c: Context) => {
    const body = (await c.req.json()) as {
      chat?: string;
      messageId?: string;
      sender?: string;
      reaction?: string;
    };

    if (!body.chat || !body.messageId) {
      return responseNotFound(c, "`chat` and `messageId` are required.");
    }

    const result = await messageService.react(
      sessionId(c),
      body.chat,
      body.messageId,
      body.reaction ?? "",
      body.sender ?? "",
    );

    return responseCreated(c, "Reaction sent successfully", result);
  };

  editMessage = async (c: Context) => {
    const body = (await c.req.json()) as {
      chat?: string;
      messageId?: string;
      text?: string;
    };

    if (!body.chat || !body.messageId || !body.text) {
      return responseNotFound(c, "`chat`, `messageId` and `text` are required.");
    }

    const result = await messageService.edit(
      sessionId(c),
      body.chat,
      body.messageId,
      body.text,
    );

    return responseOK(c, "Message edited successfully", result);
  };

  revokeMessage = async (c: Context) => {
    const body = (await c.req.json()) as {
      chat?: string;
      messageId?: string;
      sender?: string;
    };

    if (!body.chat || !body.messageId) {
      return responseNotFound(c, "`chat` and `messageId` are required.");
    }

    const result = await messageService.revoke(
      sessionId(c),
      body.chat,
      body.messageId,
      body.sender ?? "",
    );

    return responseOK(c, "Message revoked successfully", result);
  };
}

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export const messageController = new MessageController();
