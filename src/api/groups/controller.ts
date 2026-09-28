import type { Context } from "hono";
import { groupService } from "./service";
import { responseCreated, responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";
import { safeJson } from "../utils/body";

class GroupController {
  getGroups = async (c: Context) => {
    const groups = await groupService.getGroups(sessionId(c));
    return responseOK(c, "Groups retrieved successfully", groups);
  };

  getGroupById = async (c: Context) => {
    const jid = c.req.query("jid");
    if (!jid) return responseBadRequest(c, "`jid` query parameter is required.");

    const group = await groupService.getGroup(sessionId(c), jid);
    return responseOK(c, "Group retrieved successfully", group);
  };

  createGroup = async (c: Context) => {
    const body = await safeJson(c);
    const name = (body.name as string | undefined)?.trim();
    const participants = body.participants as string[] | undefined;

    if (!name) return responseBadRequest(c, "`name` is required.");
    if (!participants?.length) {
      return responseBadRequest(c, "`participants` must contain at least one number.");
    }

    const group = await groupService.createGroup(sessionId(c), name, participants);
    return responseCreated(c, "Group created successfully", group);
  };

  getInviteLink = async (c: Context) => {
    const jid = c.req.query("jid");
    if (!jid) return responseBadRequest(c, "`jid` query parameter is required.");

    const reset = c.req.query("reset") === "true";
    const result = await groupService.getInviteLink(sessionId(c), jid, reset);

    return responseOK(c, "Invite link retrieved successfully", result);
  };

  getGroupFromInvite = async (c: Context) => {
    const code = c.req.query("code");
    if (!code) return responseBadRequest(c, "`code` query parameter is required.");

    const group = await groupService.getGroupFromInvite(sessionId(c), code);
    return responseOK(c, "Group preview retrieved successfully", group);
  };

  joinGroup = async (c: Context) => {
    const body = await safeJson(c);
    const code = body.code as string | undefined;
    if (!code) return responseBadRequest(c, "`code` is required.");

    const result = await groupService.joinWithLink(sessionId(c), code);
    return responseOK(c, "Joined group successfully", result);
  };

  leaveGroup = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;
    if (!jid) return responseBadRequest(c, "`jid` is required.");

    const result = await groupService.leaveGroup(sessionId(c), jid);
    return responseOK(c, "Left group successfully", result);
  };

  updateGroup = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;

    if (!jid) return responseBadRequest(c, "`jid` is required.");

    const group = await groupService.updateSettings(sessionId(c), jid, {
      name: body.name as string | undefined,
      topic: body.topic as string | undefined,
      announce: body.announce as boolean | undefined,
      locked: body.locked as boolean | undefined,
    });

    return responseOK(c, "Group updated successfully", group);
  };

  updateParticipants = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;
    const participants = body.participants as string[] | undefined;
    const action = body.action as string | undefined;

    if (!jid) return responseBadRequest(c, "`jid` is required.");
    if (!participants?.length) {
      return responseBadRequest(c, "`participants` must be a non-empty array.");
    }

    const validActions = ["add", "remove", "promote", "demote"];
    if (!action || !validActions.includes(action)) {
      return responseBadRequest(c, `\`action\` must be one of: ${validActions.join(", ")}.`);
    }

    const result = await groupService.updateParticipants(
      sessionId(c),
      jid,
      participants,
      action as "add" | "remove" | "promote" | "demote",
    );

    return responseOK(c, "Participants updated successfully", result);
  };

  getPendingRequests = async (c: Context) => {
    const jid = c.req.query("jid");
    if (!jid) return responseBadRequest(c, "`jid` query parameter is required.");

    const result = await groupService.getPendingRequests(sessionId(c), jid);
    return responseOK(c, "Join requests retrieved successfully", result);
  };

  handleJoinRequests = async (c: Context) => {
    const body = await safeJson(c);
    const jid = body.jid as string | undefined;
    const participants = body.participants as string[] | undefined;
    const action = body.action as string | undefined;

    if (!jid) return responseBadRequest(c, "`jid` is required.");
    if (!participants?.length) {
      return responseBadRequest(c, "`participants` must be a non-empty array.");
    }
    if (action !== "approve" && action !== "reject") {
      return responseBadRequest(c, "`action` must be either `approve` or `reject`.");
    }

    const result = await groupService.handleJoinRequests(
      sessionId(c),
      jid,
      participants,
      action as "approve" | "reject",
    );

    return responseOK(c, "Join requests handled successfully", result);
  };
}

export const groupController = new GroupController();
