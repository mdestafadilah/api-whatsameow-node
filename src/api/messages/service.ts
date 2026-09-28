import { eq } from "drizzle-orm";
import type { WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { db } from "@/database/db";
import { messagesTable } from "@/database/schema";
import { messageRepository, type MessageQuery } from "@/database/repositories/messageRepository";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { clients } from "@/lib/whatsapp/clientManager";
import {
  extractText,
  detectType,
  prepareMessage,
  toJid,
  type PreparedMessage,
  type SendBody,
} from "@/lib/whatsapp/messages";
import {
  computeTypingDelay,
  resolvePacing,
  sendScheduler,
  sleep,
  type PacingConfig,
} from "@/lib/whatsapp/pacing";
import { badRequest, notFound, upstreamError } from "@/types/errors";
import type { MessageType } from "@/types/apiResponse";
import * as queue from "@/lib/redis/messageQueue";
import * as queueWorker from "@/lib/redis/queueWorker";
import * as cache from "@/lib/redis/cache";
import { CACHE } from "@/lib/redis/cache";

class MessageService {
  /**
   * Send a message through a session and record it.
   *
   * The row is written even when the send fails, so the dashboard can show what
   * was attempted instead of silently losing it.
   *
   * Pacing happens *inside* the per-chat scheduler, so the typing indicator and
   * the message arrive together and two concurrent calls to the same chat cannot
   * interleave their delays.
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

    const pacing = resolvePacing(body.pacing);
    const recordId = crypto.randomUUID();

    // Resolve the JID up front so the scheduler can key on the chat even when
    // the send itself fails.
    const chatJid = toJid(body.to);
    const chatKey = `${sessionId}:${chatJid}`;

    try {
      const prepared = await prepareMessage(runtime.client, body);

      /**
       * Queue the send when Redis is available, so a burst cannot outrun
       * whatsmeow's single IPC pipe and a restart cannot lose accepted work.
       *
       * The payload is prepared *before* enqueueing: media is already uploaded
       * and the proto message is final, so the worker holds a finished message
       * rather than a file path that may be gone by the time it runs.
       *
       * Enqueue failure is not an error — it falls through to a direct send,
       * because Redis being down must not stop messages from going out.
       */
      if (!body.immediate) {
        const queued = await queue.enqueue({
          id: recordId,
          sessionId,
          jid: prepared.jid,
          chatKey,
          message: prepared.message,
          poll:
            prepared.type === "poll"
              ? {
                  question: body.text!,
                  options: body.pollOptions!,
                  selectableCount: body.pollSelectableCount ?? 1,
                }
              : undefined,
          type: prepared.type,
          preview: prepared.preview ?? "",
          pacing,
          enqueuedAt: new Date().toISOString(),
          attempts: 0,
          status: "queued",
        });

        if (queued) {
          await messageRepository.add({
            id: recordId,
            sessionId,
            chatJid: prepared.jid,
            waMessageId: null,
            direction: "outgoing",
            type: prepared.type,
            body: prepared.preview,
            status: "queued",
            createdAt: new Date(),
          });

          // Kick the worker without waiting for it. The response reports the
          // queue position; the send itself happens in the background.
          void queueWorker.drain(sessionId).catch(() => undefined);

          const position = await queue.depth(sessionId);

          // The chat list gains this chat (or bumps it), so the cached view is
          // now stale. Done here rather than only on success, because the queue
          // view itself also changed.
          void cache.invalidateMessageViews(sessionId);

          return {
            id: recordId,
            waMessageId: null,
            to: prepared.jid,
            type: prepared.type,
            timestamp: null,
            queued: true,
            queuePosition: position,
          };
        }
      }

      const result = await sendScheduler.schedule(chatKey, pacing.chatCooldownMs, async () => {
        await this.applyPacing(runtime.client, prepared.jid, prepared, pacing);

        // Polls use a dedicated whatsmeow builder rather than a proto payload.
        return prepared.type === "poll"
          ? await runtime.client.sendPollCreation(
              prepared.jid,
              body.text!,
              body.pollOptions!,
              body.pollSelectableCount ?? 1,
            )
          : await runtime.client.sendRawMessage(prepared.jid, prepared.message);
      });

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

      void cache.invalidateMessageViews(sessionId);

      return {
        id: recordId,
        waMessageId: result?.id ?? null,
        to: prepared.jid,
        type: prepared.type,
        timestamp: result?.timestamp ?? null,
        queued: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await messageRepository.add({
        id: recordId,
        sessionId,
        chatJid,
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

  /**
   * Simulate a human: mark the chat as typing, wait a plausible amount of time,
   * then stop typing so the message lands.
   *
   * Both presence calls are best-effort. A chat that silently drops the typing
   * receipt, or a client that is briefly mid-reconnect, must not fail the send —
   * the indicator is a courtesy, the message is the point.
   */
  private async applyPacing(
    client: WhatsmeowClient,
    jid: string,
    prepared: PreparedMessage,
    pacing: PacingConfig,
  ): Promise<void> {
    if (!pacing.typing) return;

    // Media arrives with no typed text, so `preview` (a caption, filename, or
    // the text itself) is what the pause should be proportionate to.
    const delay = computeTypingDelay(prepared.preview ?? "", pacing);

    try {
      await client.sendChatPresence(jid, "composing");
    } catch {
      // Typing indicator is optional; continue to the send regardless.
    }

    try {
      if (delay > 0) await sleep(delay);
    } finally {
      try {
        await client.sendChatPresence(jid, "paused");
      } catch {
        // As above — a swallowed `paused` must not block the message.
      }
    }
  }

  async list(query: MessageQuery) {
    return messageRepository.list(query);
  }

  /**
   * Distinct chats for a session, cached briefly.
   *
   * The dashboard polls this every few seconds, and it is an unindexed
   * `GROUP BY` over the whole message table, so it is the most expensive read in
   * the app for the least volatile data. Invalidation happens explicitly on send
   * (`invalidateMessageViews`); the TTL is only a backstop.
   */
  async listChats(sessionId: string, limit: number) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    return cache.wrap(CACHE.chats, `${sessionId}:${limit}`, async () => {
      const rows = await messageRepository.listChats(sessionId, limit);
      return rows.map((row) => ({
        chatJid: row.chatJid,
        lastMessageAt: new Date(Number(row.lastMessageAt)).toISOString(),
        messageCount: Number(row.messageCount),
      }));
    });
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
