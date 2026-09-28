import type { Context } from "hono";
import { contactService } from "./service";
import { responseOK, responseBadRequest } from "../utils/response";
import { sessionId } from "../utils/context";
import { safeJson } from "../utils/body";

class ContactController {
  /**
   * Accepts either `{ phones: [...] }` or `{ phone: "..." }`.
   */
  checkNumbers = async (c: Context) => {
    const body = await safeJson(c);
    const phones = (body.phones as string[] | undefined) ?? (body.phone ? [body.phone as string] : []);
    if (phones.length === 0) {
      return responseBadRequest(c, "Provide `phone` or `phones` in the request body.");
    }

    const results = await contactService.checkNumbers(sessionId(c), phones);
    return responseOK(c, "Numbers checked successfully", results);
  };

  getProfilePicture = async (c: Context) => {
    const jid = c.req.query("jid");
    if (!jid) return responseBadRequest(c, "`jid` query parameter is required.");

    const result = await contactService.getProfilePicture(sessionId(c), jid);
    return responseOK(c, "Profile picture retrieved successfully", result);
  };

  getInfo = async (c: Context) => {
    const body = await safeJson(c);
    const jids = body.jids as string[] | undefined;
    if (!jids?.length) return responseBadRequest(c, "`jids` must be a non-empty array.");

    const result = await contactService.getInfo(sessionId(c), jids);
    return responseOK(c, "Contact info retrieved successfully", result);
  };

  getDevices = async (c: Context) => {
    const body = await safeJson(c);
    const jids = body.jids as string[] | undefined;
    if (!jids?.length) return responseBadRequest(c, "`jids` must be a non-empty array.");

    const result = await contactService.getDevices(sessionId(c), jids);
    return responseOK(c, "User devices retrieved successfully", result);
  };

  getBusinessProfile = async (c: Context) => {
    const jid = c.req.query("jid");
    if (!jid) return responseBadRequest(c, "`jid` query parameter is required.");

    const result = await contactService.getBusinessProfile(sessionId(c), jid);
    return responseOK(c, "Business profile retrieved successfully", result);
  };
}

export const contactController = new ContactController();
