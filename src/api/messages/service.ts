import { eq } from "drizzle-orm";
import { db } from "@/database/db";
import { messagesTable } from "@/database/schema";
import { messageRepository, type MessageQuery } from "@/database/repositories/messageRepository";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { clients } from "@/lib/whatsapp/clientManager";
import { extractText, detectType, prepareMessage, type SendBody } from "@/lib/whatsapp/messages";
import { badRequest, notFound, upstreamError } from "@/types/errors";
import type { MessageType } from "@/types/apiResponse";

class MessageService {
  /**
   * Send a message through a session and record it.
   *
   * The row is written even when the send fails, so the dashboard can show what
   * was attempted instead of silently losing it.
   */
  async send(sessionId: string, body: SendBody) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const runtime = await clients.ensure(sessionId);

    if (!runtime.jid) {
      throw badRequest(
        "This session is not paired yet. Link a device with a QR code or pairing code first.",
      );
    }

    const recordId = crypto.randomUUID();

    try {
      const prepared = await prepareMessage(runtime.client, body);

      // Polls use a dedicated whatsmeow builder rather than a proto payload.
      const result =
        prepared.type === "poll"
          ? await runtime.client.sendPollCreation(
              prepared.jid,
              body.text!,
              body.pollOptions!,
              body.pollSelectableCount ?? 1,
            )
          : await runtime.client.sendRawMessage(prepared.jid, prepared.message);

      await messageRepository.add({
        id: recordId,
        sessionId,
        chatJid: prepared.jid,
        waMessageId: result?.id ?? null,
        direction: "outgoing",
        type: prepared.type,
        body: prepared.preview,
        status: "sent",
        createdAt: new Date(),
      });

      return {
        id: recordId,
        waMessageId: result?.id ?? null,
        to: prepared.jid,
        type: prepared.type,
        timestamp: result?.timestamp ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await messageRepository.add({
        id: recordId,
        sessionId,
        chatJid: body.to,
        waMessageId: null,
        direction: "outgoing",
        type: (body.type ?? "text") as MessageType,
        body: body.text ?? body.caption ?? null,
        status: "failed",
        error: message,
        createdAt: new Date(),
      });

      throw upstreamError(`Failed to send message: ${message}`);
    }
  }

  async list(query: MessageQuery) {
    return messageRepository.list(query);
  }

  async listChats(sessionId: string, limit: number) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const rows = await messageRepository.listChats(sessionId, limit);
    return rows.map((row) => ({
      chatJid: row.chatJid,
      lastMessageAt: new Date(Number(row.lastMessageAt)).toISOString(),
      messageCount: Number(row.messageCount),
    }));
  }

  /**
   * Mark messages read.
   *
   * whatsmeow needs `chat` plus a `sender` for group receipts, so both are
   * resolved from the stored rows when the caller only supplies ids.
   */
  async markRead(sessionId: string, ids: string[], chat?: string) {
    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.sessionId, sessionId));

    const targets = ids.length > 0 ? rows.filter((row) => ids.includes(row.waMessageId ?? "")) : rows;
    if (targets.length === 0) throw notFound("No matching messages to mark as read.");

    const chatJid = chat ?? targets[0].chatJid;
    const waIds = targets.map((row) => row.waMessageId).filter((id): id is string => Boolean(id));

    if (waIds.length === 0) {
      throw badRequest("Stored messages have no WhatsApp message id to acknowledge.");
    }

    await runtime.client.markRead(waIds, chatJid);
    return { chat: chatJid, marked: waIds.length };
  }

  /** React to a message in a chat. */
  async react(sessionId: string, chat: string, messageId: string, reaction: string, sender: string) {
    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    const result = await runtime.client.sendReaction(chat, sender, messageId, reaction);
    return { waMessageId: result?.id ?? null, reaction };
  }

  /** Edit a previously sent text message. */
  async edit(sessionId: string, chat: string, messageId: string, text: string) {
    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    const result = await runtime.client.editMessage(chat, messageId, { conversation: text });

    await messageRepository.add({
      id: crypto.randomUUID(),
      sessionId,
      chatJid: chat,
      waMessageId: result?.id ?? null,
      direction: "outgoing",
      type: "text",
      body: text,
      status: "edited",
      createdAt: new Date(),
    });

    return { waMessageId: result?.id ?? null };
  }

  /** Revoke (delete for everyone) a message. */
  async revoke(sessionId: string, chat: string, messageId: string, sender: string) {
    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    await runtime.client.revokeMessage(chat, sender, messageId);
    return { revoked: messageId };
  }

  /**
   * Persist an inbound message observed on the event bus.
   *
   * Called by the gateway listener rather than a controller — nothing in the
   * HTTP surface triggers this.
   */
  async recordIncoming(
    sessionId: string,
    info: { id: string; chat: string; sender: string; pushName?: string },
    message: Record<string, unknown>,
  ) {
    const exists = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(eq(messagesTable.waMessageId, info.id))
      .limit(1);

    // WhatsApp redelivers on reconnect; the unique wa id protects us.
    if (exists.length > 0) return;

    await messageRepository.add({
      id: crypto.randomUUID(),
      sessionId,
      chatJid: info.chat,
      waMessageId: info.id,
      direction: "incoming",
      type: detectType(message),
      body: extractText(message),
      status: "received",
      createdAt: new Date(),
    });
  }
}

export const messageService = new MessageService();
