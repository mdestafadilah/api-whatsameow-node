import { api, http } from "@/lib/http";
import type {
  ApiResponse,
  ChatSummary,
  Health,
  Message,
  PacingOptions,
  PacingPresetName,
  Paginated,
  Session,
  SessionStatusDetail,
} from "@/types/api";

export const sessionService = {
  async getSessions(): Promise<Session[]> {
    const response = await http.get(api.sessions.getAll).json<ApiResponse<Session[]>>();
    return response.data ?? [];
  },

  async getSession(id: string): Promise<Session> {
    const response = await http.get(api.sessions.getOne(id)).json<ApiResponse<Session>>();
    if (!response.data) throw new Error("Session not found");
    return response.data;
  },

  async getStatus(id: string): Promise<SessionStatusDetail> {
    const response = await http
      .get(api.sessions.status(id))
      .json<ApiResponse<SessionStatusDetail>>();
    if (!response.data) throw new Error("Status unavailable");
    return response.data;
  },

  async createSession(input: { label?: string; phoneNumber?: string }): Promise<Session> {
    const response = await http
      .post(api.sessions.create, { json: input })
      .json<ApiResponse<Session>>();
    if (!response.data) throw new Error("Could not create session");
    return response.data;
  },

  async deleteSession(id: string): Promise<void> {
    await http.delete(api.sessions.remove(id));
  },

  async getQr(id: string): Promise<{ qr: string; receivedAt: string }> {
    const response = await http
      .get(api.sessions.qr(id), { timeout: 30_000 })
      .json<ApiResponse<{ qr: string; receivedAt: string }>>();
    if (!response.data) throw new Error("No QR code available");
    return response.data;
  },

  async requestPairCode(id: string, phoneNumber: string): Promise<{ pairCode: string }> {
    const response = await http
      .post(api.sessions.pairCode(id), { json: { phoneNumber }, timeout: 60_000 })
      .json<ApiResponse<{ pairCode: string; phoneNumber: string }>>();
    if (!response.data) throw new Error("No pairing code returned");
    return response.data;
  },

  async connect(id: string): Promise<SessionStatusDetail> {
    const response = await http
      .post(api.sessions.connect(id))
      .json<ApiResponse<SessionStatusDetail>>();
    if (!response.data) throw new Error("Connect failed");
    return response.data;
  },

  async disconnect(id: string): Promise<SessionStatusDetail> {
    const response = await http
      .post(api.sessions.disconnect(id))
      .json<ApiResponse<SessionStatusDetail>>();
    if (!response.data) throw new Error("Disconnect failed");
    return response.data;
  },

  async logout(id: string): Promise<Session> {
    const response = await http.post(api.sessions.logout(id)).json<ApiResponse<Session>>();
    if (!response.data) throw new Error("Logout failed");
    return response.data;
  },
};

export type SendPayload = {
  to: string;
  type?: string;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  /**
   * Anti-ban pacing. Omit to accept the server default (`natural`); pass
   * `{ preset: "off" }` for an immediate send.
   */
  pacing?: PacingPayload;
};

export type PacingPayload = {
  preset?: PacingPresetName;
  typing?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
  msPerChar?: number;
  jitterRatio?: number;
  chatCooldownMs?: number;
};

export const messageService = {
  async getMessages(id: string, limit = 50): Promise<Message[]> {
    const response = await http
      .get(api.messages.getAll(id), { searchParams: { limit } })
      .json<ApiResponse<Paginated<Message>>>();
    return response.data?.items ?? [];
  },

  async send(id: string, payload: SendPayload): Promise<{ waMessageId: string | null }> {
    const response = await http
      .post(api.messages.send(id), { json: payload, timeout: 120_000 })
      .json<ApiResponse<{ waMessageId: string | null }>>();
    return response.data ?? { waMessageId: null };
  },

  async getChats(id: string): Promise<ChatSummary[]> {
    const response = await http
      .get(api.messages.chats(id))
      .json<ApiResponse<ChatSummary[]>>();
    return response.data ?? [];
  },
};

export const pacingService = {
  /** Presets the server will honour, so the UI never hardcodes timing values. */
  async getOptions(): Promise<PacingOptions> {
    const response = await http.get(api.pacing).json<ApiResponse<PacingOptions>>();
    if (!response.data) throw new Error("Pacing options unavailable");
    return response.data;
  },
};

export const healthService = {
  async getHealth(): Promise<Health> {
    const response = await http
      .get("sessions/health")
      .json<ApiResponse<Health>>()
      .catch(async () => {
        // `/health` lives under misc per session; fall back to the API root name
        // probe so the header still shows something meaningful.
        const fallback = await http.get("name").json<ApiResponse<{ name: string }>>();
        return {
          success: true,
          message: fallback.message,
          data: {
            status: "ok",
            uptimeSeconds: 0,
            nodeVersion: "unknown",
            platform: "unknown",
            sessions: { total: 0, live: 0, connected: 0 },
          },
        } satisfies ApiResponse<Health>;
      });
    if (!response.data) throw new Error("Health check failed");
    return response.data;
  },
};
