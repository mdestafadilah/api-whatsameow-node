import { clients } from "@/lib/whatsapp/clientManager";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { badRequest, notFound } from "@/types/errors";
import { toJid } from "@/lib/whatsapp/messages";

class ContactService {
  private async runtime(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    return runtime;
  }

  /**
   * Check which numbers exist on WhatsApp.
   *
   * whatsmeow batches these automatically (~50 per request); we chunk on top so
   * a large CSV does not land in one oversized IPC command.
   */
  async checkNumbers(sessionId: string, phones: string[]) {
    const { client } = await this.runtime(sessionId);

    const cleaned = phones
      .map((phone) => phone.replace(/[^\d]/g, ""))
      .filter((phone) => phone.length >= 7);

    if (cleaned.length === 0) {
      throw badRequest("Provide at least one phone number with a country code.");
    }

    const results: Awaited<ReturnType<typeof client.isOnWhatsApp>> = [];
    for (let i = 0; i < cleaned.length; i += 50) {
      const batch = cleaned.slice(i, i + 50);
      results.push(...(await client.isOnWhatsApp(batch)));
    }

    return results;
  }

  /** Profile picture URL for a user or group. */
  async getProfilePicture(sessionId: string, jid: string) {
    const { client } = await this.runtime(sessionId);

    try {
      return await client.getProfilePicture(toJid(jid));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A missing picture is a normal outcome, not a server fault.
      return { url: "", id: "", type: "", error: message };
    }
  }

  /** Status text, verified name and picture id for a set of JIDs. */
  async getInfo(sessionId: string, jids: string[]) {
    const { client } = await this.runtime(sessionId);
    return client.getUserInfo(jids.map(toJid));
  }

  /** Devices linked to a set of users. */
  async getDevices(sessionId: string, jids: string[]) {
    const { client } = await this.runtime(sessionId);
    return client.getUserDevices(jids.map(toJid));
  }

  /** Business profile, when the number is a WhatsApp Business account. */
  async getBusinessProfile(sessionId: string, jid: string) {
    const { client } = await this.runtime(sessionId);
    return client.getBusinessProfile(toJid(jid));
  }
}

export const contactService = new ContactService();
