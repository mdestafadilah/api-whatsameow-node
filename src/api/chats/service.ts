import { clients } from "@/lib/whatsapp/clientManager";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { badRequest, notFound } from "@/types/errors";
import { toJid } from "@/lib/whatsapp/messages";

/**
 * Chat-adjacent operations that are not about a single message: privacy,
 * blocklist, presence, disappearing messages and typing indicators.
 */
class ChatService {
  private async runtime(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    return runtime;
  }

  // ── Typing & presence ─────────────────────────────

  /** Show "typing…" in a chat. Always pair with `paused` when done. */
  async setTyping(sessionId: string, chatJid: string, state: "composing" | "paused") {
    const { client } = await this.runtime(sessionId);

    if (!["composing", "paused"].includes(state)) {
      throw badRequest("`state` must be `composing` or `paused`.");
    }

    await client.sendChatPresence(toJid(chatJid), state);
    return { chat: chatJid, state };
  }

  /** Advertise this account as online / offline. */
  async setPresence(sessionId: string, presence: "available" | "unavailable") {
    const { client } = await this.runtime(sessionId);

    if (!["available", "unavailable"].includes(presence)) {
      throw badRequest("`presence` must be `available` or `unavailable`.");
    }

    await client.sendPresence(presence);
    return { presence };
  }

  /** Subscribe to a contact's presence updates. */
  async subscribePresence(sessionId: string, jid: string) {
    const { client } = await this.runtime(sessionId);
    await client.subscribePresence(toJid(jid));
    return { jid, subscribed: true };
  }

  // ── Privacy ───────────────────────────────────────

  async getPrivacy(sessionId: string) {
    const { client } = await this.runtime(sessionId);
    return client.getPrivacySettings();
  }

  async setPrivacy(sessionId: string, name: string, value: string) {
    const { client } = await this.runtime(sessionId);
    return client.setPrivacySetting(
      name as Parameters<typeof client.setPrivacySetting>[0],
      value as Parameters<typeof client.setPrivacySetting>[1],
    );
  }

  async getStatusPrivacy(sessionId: string) {
    const { client } = await this.runtime(sessionId);
    return client.getStatusPrivacy();
  }

  // ── Blocklist ─────────────────────────────────────

  async getBlocklist(sessionId: string) {
    const { client } = await this.runtime(sessionId);
    return client.getBlocklist();
  }

  async updateBlocklist(sessionId: string, jid: string, action: "block" | "unblock") {
    const { client } = await this.runtime(sessionId);
    return client.updateBlocklist(toJid(jid), action);
  }

  // ── Disappearing messages ─────────────────────────

  /** Set the default timer (seconds) applied to new chats. `0` disables. */
  async setDefaultDisappearingTimer(sessionId: string, seconds: number) {
    const { client } = await this.runtime(sessionId);
    await client.setDefaultDisappearingTimer(seconds);
    return { seconds };
  }

  async setDisappearingTimer(sessionId: string, chatJid: string, seconds: number) {
    const { client } = await this.runtime(sessionId);
    await client.setDisappearingTimer(toJid(chatJid), seconds);
    return { chat: chatJid, seconds };
  }

  // ── Profile ───────────────────────────────────────

  /** Set the "about"/status text of the paired account. */
  async setStatusMessage(sessionId: string, message: string) {
    const { client } = await this.runtime(sessionId);
    await client.setStatusMessage(message);
    return { message };
  }

  /** Resolve a wa.me-style contact QR link to its target. */
  async resolveContactQr(sessionId: string, code: string) {
    const { client } = await this.runtime(sessionId);
    return client.resolveContactQRLink(code);
  }

  /** This account's own contact QR link. */
  async getContactQr(sessionId: string, revoke: boolean) {
    const { client } = await this.runtime(sessionId);
    return { link: await client.getContactQRLink(revoke) };
  }
}

export const chatService = new ChatService();
