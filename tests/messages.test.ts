import { describe, expect, it } from "vitest";
import { detectType, extractText, guessMimetype, toJid } from "@/lib/whatsapp/messages";
import { ApiError } from "@/types/errors";

describe("toJid", () => {
  it("appends the user server suffix to a bare phone number", () => {
    expect(toJid("628123456789")).toBe("628123456789@s.whatsapp.net");
  });

  it("strips formatting characters from a phone number", () => {
    expect(toJid("+62 812-3456-789")).toBe("628123456789@s.whatsapp.net");
  });

  it("passes a group JID through untouched", () => {
    expect(toJid("1234567890-1234567890@g.us")).toBe("1234567890-1234567890@g.us");
  });

  it("rejects a number that is too short to be international", () => {
    expect(() => toJid("12345")).toThrow(ApiError);
  });

  it("rejects an empty recipient", () => {
    expect(() => toJid("   ")).toThrow(ApiError);
  });

  it("rejects a malformed JID", () => {
    expect(() => toJid("not a jid@")).toThrow(ApiError);
  });
});

describe("extractText", () => {
  it("reads a plain conversation", () => {
    expect(extractText({ conversation: "hello" })).toBe("hello");
  });

  it("reads an extended text message", () => {
    expect(extractText({ extendedTextMessage: { text: "quoted reply" } })).toBe("quoted reply");
  });

  it("falls back to an image caption", () => {
    expect(extractText({ imageMessage: { caption: "look at this" } })).toBe("look at this");
  });

  it("returns an empty string for an unknown shape", () => {
    expect(extractText({ somethingElse: true })).toBe("");
  });
});

describe("detectType", () => {
  it.each([
    [{ conversation: "hi" }, "text"],
    [{ imageMessage: {} }, "image"],
    [{ videoMessage: {} }, "video"],
    [{ audioMessage: {} }, "audio"],
    [{ documentMessage: {} }, "document"],
    [{ stickerMessage: {} }, "sticker"],
    [{ locationMessage: {} }, "location"],
    [{ contactMessage: {} }, "contact"],
    [{ pollCreationMessage: {} }, "poll"],
    [{ mysteryMessage: {} }, "raw"],
  ])("classifies %o as %s", (message, expected) => {
    expect(detectType(message as Record<string, unknown>)).toBe(expected);
  });
});

describe("guessMimetype", () => {
  it("maps a known extension", () => {
    expect(guessMimetype("photo.JPG")).toBe("image/jpeg");
  });

  it("defaults to a binary stream for unknown extensions", () => {
    expect(guessMimetype("archive.xyz")).toBe("application/octet-stream");
  });
});
