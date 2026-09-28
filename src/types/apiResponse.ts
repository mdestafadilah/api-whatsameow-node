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

export type SessionView = {
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

export type MessageView = {
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
