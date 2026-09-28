import type { Context } from "hono";
import { messageService } from "./service";
import { responseCreated, responseNotFound, responseOK, responsePaginated } from "../utils/response";
import { sessionId } from "../utils/context";
import { safeJson, clampNumber } from "../utils/body";
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
    const body = await safeJson(c);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const chat = typeof body.chat === "string" ? body.chat : undefined;

    const result = await messageService.markRead(sessionId(c), ids, chat);
    return responseOK(c, "Messages marked as read", result);
  };

  reactToMessage = async (c: Context) => {
    const body = await safeJson(c);
    const chat = body.chat as string | undefined;
    const messageId = body.messageId as string | undefined;

    if (!chat || !messageId) {
      return responseNotFound(c, "`chat` and `messageId` are required.");
    }

    const result = await messageService.react(
      sessionId(c),
      chat,
      messageId,
      (body.reaction as string) ?? "",
      (body.sender as string) ?? "",
    );

    return responseCreated(c, "Reaction sent successfully", result);
  };

  editMessage = async (c: Context) => {
    const body = await safeJson(c);
    const chat = body.chat as string | undefined;
    const messageId = body.messageId as string | undefined;
    const text = body.text as string | undefined;

    if (!chat || !messageId || !text) {
      return responseNotFound(c, "`chat`, `messageId` and `text` are required.");
    }

    const result = await messageService.edit(sessionId(c), chat, messageId, text);
    return responseOK(c, "Message edited successfully", result);
  };

  revokeMessage = async (c: Context) => {
    const body = await safeJson(c);
    const chat = body.chat as string | undefined;
    const messageId = body.messageId as string | undefined;

    if (!chat || !messageId) {
      return responseNotFound(c, "`chat` and `messageId` are required.");
    }

    const result = await messageService.revoke(
      sessionId(c),
      chat,
      messageId,
      (body.sender as string) ?? "",
    );

    return responseOK(c, "Message revoked successfully", result);
  };
}

export const messageController = new MessageController();
