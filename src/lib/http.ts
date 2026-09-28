import ky from "ky";

/**
 * Endpoint map, mirroring the BHVR template's convention of keeping paths in
 * one place so a route rename is a single edit.
 */
export const api = {
  health: "sessions/health",
  sessions: {
    getAll: "sessions",
    getOne: (id: string) => `sessions/${id}`,
    create: "sessions",
    remove: (id: string) => `sessions/${id}`,
    status: (id: string) => `sessions/${id}/status`,
    qr: (id: string) => `sessions/${id}/qr`,
    pairCode: (id: string) => `sessions/${id}/pair-code`,
    connect: (id: string) => `sessions/${id}/connect`,
    disconnect: (id: string) => `sessions/${id}/disconnect`,
    logout: (id: string) => `sessions/${id}/logout`,
  },
  messages: {
    getAll: (id: string) => `sessions/${id}/messages`,
    send: (id: string) => `sessions/${id}/messages`,
    chats: (id: string) => `sessions/${id}/messages/chats`,
    markRead: (id: string) => `sessions/${id}/messages/read`,
  },
  chats: {
    typing: (id: string) => `sessions/${id}/chats/typing`,
    presence: (id: string) => `sessions/${id}/chats/presence`,
    privacy: (id: string) => `sessions/${id}/chats/privacy`,
    blocklist: (id: string) => `sessions/${id}/chats/blocklist`,
  },
  contacts: {
    check: (id: string) => `sessions/${id}/contacts/check`,
    picture: (id: string) => `sessions/${id}/contacts/picture`,
  },
  groups: {
    getAll: (id: string) => `sessions/${id}/groups`,
    create: (id: string) => `sessions/${id}/groups`,
  },
  misc: {
    health: (id: string) => `sessions/${id}/misc/health`,
  },
  events: (id?: string) => (id ? `events?sessionId=${id}` : "events"),
};

const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

export const http = ky.create({
  prefixUrl: "/api",
  timeout: 120_000,
  headers: {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  },
  hooks: {
    beforeError: [
      async (error) => {
        // Surface the API's own message instead of ky's generic HTTP error.
        try {
          const body = (await error.response.clone().json()) as { message?: string };
          if (body?.message) error.message = body.message;
        } catch {
          // Non-JSON error body — keep ky's message.
        }
        return error;
      },
    ],
  },
});
