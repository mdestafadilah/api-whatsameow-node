import { clients } from "@/lib/whatsapp/clientManager";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { badRequest, notFound } from "@/types/errors";
import { toJid } from "@/lib/whatsapp/messages";

class GroupService {
  private async runtime(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    return runtime;
  }

  /** Every group this account is a member of. */
  async getGroups(sessionId: string) {
    const { client } = await this.runtime(sessionId);
    const groups = await client.getJoinedGroups();

    return groups.map((group) => ({
      jid: group.jid,
      name: group.name,
      description: group.description ?? null,
      owner: group.owner ?? null,
      announce: group.announce,
      locked: group.locked,
      memberCount: group.participants?.length ?? 0,
    }));
  }

  async getGroup(sessionId: string, groupJid: string) {
    const { client } = await this.runtime(sessionId);
    return client.getGroupInfo(toJid(groupJid));
  }

  async createGroup(sessionId: string, name: string, participants: string[]) {
    const { client } = await this.runtime(sessionId);
    return client.createGroup(name, participants.map(toJid));
  }

  async getInviteLink(sessionId: string, groupJid: string, reset: boolean) {
    const { client } = await this.runtime(sessionId);
    const link = await client.getGroupInviteLink(toJid(groupJid), reset);
    return { link };
  }

  /** Preview a group from an invite code without joining. */
  async getGroupFromInvite(sessionId: string, code: string) {
    const { client } = await this.runtime(sessionId);
    return client.getGroupInfoFromLink(code);
  }

  async joinWithLink(sessionId: string, code: string) {
    const { client } = await this.runtime(sessionId);
    const jid = await client.joinGroupWithLink(code);
    return { jid };
  }

  async leaveGroup(sessionId: string, groupJid: string) {
    const { client } = await this.runtime(sessionId);
    await client.leaveGroup(toJid(groupJid));
    return { jid: groupJid, left: true };
  }

  async updateSettings(
    sessionId: string,
    groupJid: string,
    settings: { name?: string; topic?: string; announce?: boolean; locked?: boolean },
  ) {
    const { client } = await this.runtime(sessionId);
    const jid = toJid(groupJid);

    if (settings.name !== undefined) await client.setGroupName(jid, settings.name);
    if (settings.topic !== undefined) await client.setGroupTopic(jid, settings.topic);
    if (settings.announce !== undefined) await client.setGroupAnnounce(jid, settings.announce);
    if (settings.locked !== undefined) await client.setGroupLocked(jid, settings.locked);

    return client.getGroupInfo(jid);
  }

  /** Add / remove / promote / demote members. */
  async updateParticipants(
    sessionId: string,
    groupJid: string,
    participants: string[],
    action: "add" | "remove" | "promote" | "demote",
  ) {
    const { client } = await this.runtime(sessionId);
    await client.updateGroupParticipants(
      toJid(groupJid),
      participants.map(toJid),
      action,
    );
    return { jid: groupJid, action, participants };
  }

  /** Pending join requests, if the group requires approval. */
  async getPendingRequests(sessionId: string, groupJid: string) {
    const { client } = await this.runtime(sessionId);
    return client.getGroupRequestParticipants(toJid(groupJid));
  }

  async handleJoinRequests(
    sessionId: string,
    groupJid: string,
    participants: string[],
    action: "approve" | "reject",
  ) {
    const { client } = await this.runtime(sessionId);
    await client.updateGroupRequestParticipants(
      toJid(groupJid),
      participants.map(toJid),
      action,
    );
    return { jid: groupJid, action, participants };
  }
}

export const groupService = new GroupService();
