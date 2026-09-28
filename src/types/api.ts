export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type SessionStatus =
  | "creating"
  | "pairing"
  | "connected"
  | "disconnected"
  | "logged_out"
  | "error";

export type Session = {
  id: string;
  label: string;
  phoneNumber: string | null;
  jid: string | null;
  pushName: string | null;
  status: SessionStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  connectedAt: string | null;
};

export type SessionStatusDetail = Session & {
  qr: string | null;
  qrReceivedAt: string | null;
  pairCode: string | null;
  pairCodeIssuedAt: string | null;
  isConnected: boolean;
  hasClient: boolean;
};

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "poll"
  | "raw";

export type Message = {
  id: string;
  sessionId: string;
  chatJid: string;
  waMessageId: string | null;
  direction: string;
  type: MessageType;
  body: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

export type ChatSummary = {
  chatJid: string;
  lastMessageAt: string;
  messageCount: number;
};

export type Health = {
  status: string;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  sessions: { total: number; live: number; connected: number };
};
