import fs from "node:fs";
import path from "node:path";
import type { WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { badRequest } from "@/types/errors";
import type { MessageType } from "@/types/apiResponse";
import type { PacingOverrides } from "./pacing";

/**
 * Anything not a phone number (groups end in `@g.us`, communities in
 * `@broadcast`) is passed through untouched.
 */
export function toJid(input: string): string {
  const value = input.trim();
  if (!value) throw badRequest("A recipient is required.");

  if (value.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+$/.test(value)) {
      throw badRequest(`"${value}" is not a valid JID.`);
    }
    return value;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 7) {
    throw badRequest(`"${value}" is not a valid phone number. Include the country code.`);
  }
  return `${digits}@s.whatsapp.net`;
}

export type SendBody = {
  to: string;
  type?: MessageType;
  text?: string;
  /** Present for media types: a local path or an http(s) URL. */
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  /** `text` reply target. */
  replyTo?: string;
  replyToParticipant?: string;
  replyToText?: string;
  /** `location` */
  latitude?: number;
  longitude?: number;
  locationName?: string;
  /** `contact` */
  contactName?: string;
  contactPhone?: string;
  /** `poll` */
  pollOptions?: string[];
  pollSelectableCount?: number;
  /** `raw` — a whatsmeow proto-shaped message. */
  raw?: Record<string, unknown>;
  /**
   * Anti-ban pacing. Omit for the `natural` default; pass `preset: "off"` for
   * an immediate send.
   */
  pacing?: PacingOverrides;
};

export type PreparedMessage = {
  jid: string;
  message: Record<string, unknown>;
  type: MessageType;
  preview: string;
};

/** Maps a declared media type onto the WhatsApp proto field it lives in. */
const MEDIA_FIELD: Record<string, string> = {
  image: "imageMessage",
  video: "videoMessage",
  audio: "audioMessage",
  document: "documentMessage",
  sticker: "stickerMessage",
};

/**
 * Turn a flat API request into the proto-shaped payload whatsmeow expects.
 *
 * whatsmeow-node deliberately exposes no `sendText()` sugar, so this is where
 * the ergonomics live — the REST surface stays friendly while the wire format
 * stays exactly whatsmeow's.
 */
export async function prepareMessage(
  client: WhatsmeowClient,
  body: SendBody,
): Promise<PreparedMessage> {
  const jid = toJid(body.to);
  const type: MessageType = body.type ?? "text";

  if (type === "text") {
    if (!body.text?.trim()) throw badRequest("`text` is required for text messages.");

    if (body.replyTo) {
      return {
        jid,
        type,
        preview: body.text,
        message: {
          extendedTextMessage: {
            text: body.text,
            contextInfo: {
              stanzaId: body.replyTo,
              participant: body.replyToParticipant ?? "",
              quotedMessage: body.replyToText
                ? { conversation: body.replyToText }
                : undefined,
            },
          },
        },
      };
    }

    return { jid, type, preview: body.text, message: { conversation: body.text } };
  }

  if (type === "raw") {
    if (!body.raw || typeof body.raw !== "object" || Object.keys(body.raw).length === 0) {
      throw badRequest("`raw` must be a non-empty object for type=raw.");
    }
    return { jid, type, preview: "[raw message]", message: body.raw };
  }

  if (type === "location") {
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      throw badRequest("`latitude` and `longitude` are required for location messages.");
    }
    return {
      jid,
      type,
      preview: body.locationName ?? `${body.latitude},${body.longitude}`,
      message: {
        locationMessage: {
          degreesLatitude: body.latitude,
          degreesLongitude: body.longitude,
          name: body.locationName ?? "",
        },
      },
    };
  }

  if (type === "contact") {
    if (!body.contactPhone) throw badRequest("`contactPhone` is required for contact messages.");
    const name = body.contactName?.trim() || body.contactPhone;
    return {
      jid,
      type,
      preview: name,
      message: {
        contactMessage: {
          displayName: name,
          vcard: [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${name}`,
            `TEL;type=CELL;waid=${body.contactPhone.replace(/[^\d]/g, "")}:${body.contactPhone}`,
            "END:VCARD",
          ].join("\n"),
        },
      },
    };
  }

  if (type === "poll") {
    if (!body.text?.trim()) throw badRequest("`text` is the poll question and is required.");
    if (!body.pollOptions || body.pollOptions.length < 2) {
      throw badRequest("`pollOptions` must contain at least two options.");
    }
    // Polls are not part of the generic proto map — whatsmeow has a dedicated
    // builder, so route through sendPollCreation instead of a message payload.
    return {
      jid,
      type,
      preview: body.text,
      message: {},
    };
  }

  // ── Media ────────────────────────────────────────
  const field = MEDIA_FIELD[type];
  if (!field) throw badRequest(`Unsupported message type "${type}".`);
  if (!body.mediaUrl) throw badRequest(`\`mediaUrl\` is required for ${type} messages.`);

  const localPath = await resolveMedia(body.mediaUrl);
  const upload = await client.uploadMedia(localPath, type === "document" ? "document" : (type as "image" | "video" | "audio"));

  const payload: Record<string, unknown> = {
    URL: upload.URL,
    directPath: upload.directPath,
    mediaKey: upload.mediaKey,
    fileEncSHA256: upload.fileEncSHA256,
    fileSHA256: upload.fileSHA256,
    // whatsmeow expects uint64 as a string on the wire.
    fileLength: String(upload.fileLength),
    mimetype: body.mimetype ?? guessMimetype(localPath),
  };

  if (body.caption && type !== "sticker") {
    payload.caption = body.caption;
  }

  if (type === "document") {
    payload.fileName = body.fileName ?? path.basename(localPath);
  }

  if (type === "audio") {
    // Voice notes are the common case for a bare audio send.
    payload.ptt = true;
  }

  const replyContext = body.replyTo
    ? {
        contextInfo: {
          stanzaId: body.replyTo,
          participant: body.replyToParticipant ?? "",
        },
      }
    : {};

  return {
    jid,
    type,
    preview: body.caption ?? body.fileName ?? path.basename(localPath),
    message: { [field]: { ...payload, ...replyContext } },
  };
}

/**
 * Accepts either a path on this machine or an http(s) URL.
 *
 * Downloads are placed under `data/media` rather than the system temp dir so
 * they survive long enough for the upload to complete on slow links.
 */
async function resolveMedia(source: string): Promise<string> {
  if (!/^https?:\/\//i.test(source)) {
    const resolved = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
    if (!fs.existsSync(resolved)) {
      throw badRequest(`Media file not found: ${resolved}`);
    }
    return resolved;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw badRequest(`Could not download media (HTTP ${response.status}): ${source}`);
  }

  const urlPath = new URL(source).pathname;
  const base = path.basename(urlPath) || `download-${Date.now()}`;
  const dir = path.resolve(process.cwd(), "data/media");
  fs.mkdirSync(dir, { recursive: true });

  const target = path.join(dir, `${Date.now()}-${base}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

function guessMimetype(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Extract readable text from an incoming proto message.
 *
 * whatsmeow hands over the raw `waE2E.Message`, which nests the real content
 * one level down for anything but a plain `conversation`.
 */
export function extractText(message: Record<string, unknown>): string {
  if (typeof message.conversation === "string") return message.conversation;

  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;

  for (const key of ["imageMessage", "videoMessage", "documentMessage"]) {
    const media = message[key] as { caption?: string } | undefined;
    if (media?.caption) return media.caption;
  }

  const location = message.locationMessage as { name?: string } | undefined;
  if (location) return location.name ?? "[location]";

  if (message.reactionMessage) return "[reaction]";
  if (message.protocolMessage) return "[protocol]";

  return "";
}

/** Classify an incoming message for storage. */
export function detectType(message: Record<string, unknown>): MessageType {
  if (message.conversation || message.extendedTextMessage) return "text";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  if (message.locationMessage) return "location";
  if (message.contactMessage) return "contact";
  if (message.pollCreationMessage) return "poll";
  return "raw";
}

export { guessMimetype };
