/**
 * Every React Query key in one place.
 *
 * Query keys used to be string literals scattered across pages, which made it
 * easy to invalidate `["sessions"]` in one file while another file cached under
 * `["session", id]` and silently went stale. Declaring them here means a typo is
 * a type error, and renaming a key is a single edit.
 */
export const queryKeys = {
  sessions: {
    all: ["sessions"] as const,
    detail: (sessionId: string) => ["session", sessionId] as const,
  },
  messages: {
    all: (sessionId: string) => ["messages", sessionId] as const,
  },
  chats: {
    all: (sessionId: string) => ["chats", sessionId] as const,
  },
  queue: {
    /** Server-wide queue depth. */
    stats: ["queue"] as const,
    /** Per-session outbound queue. */
    session: (sessionId: string) => ["queue", sessionId] as const,
  },
  pacing: {
    options: ["pacing"] as const,
  },
} as const;
