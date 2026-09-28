import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A paired (or pairing) WhatsApp account.
 *
 * Column names are written explicitly in snake_case to match the DDL in
 * `db.ts#ensureSchema`. Without the name argument Drizzle derives camelCase
 * from the property name, which silently diverges from the hand-written schema
 * the server creates on first boot.
 */
export const sessionsTable = sqliteTable("sessions", {
  id: text().primaryKey(),
  label: text().notNull(),
  /** Phone number in international format, when known. */
  phoneNumber: text("phone_number"),
  /** JID assigned by WhatsApp once paired, e.g. 628123@s.whatsapp.net. */
  jid: text(),
  pushName: text("push_name"),
  /** creating | pairing | connected | disconnected | logged_out | error */
  status: text().notNull().default("creating"),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }),
});

/**
 * Outbound message log.
 *
 * Written after a send is acknowledged by WhatsApp, so it is an audit trail
 * rather than a queue — a failed send is recorded with `status = "failed"`.
 */
export const messagesTable = sqliteTable("messages", {
  id: text().primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  chatJid: text("chat_jid").notNull(),
  /** WhatsApp-generated message id, when the send returned one. */
  waMessageId: text("wa_message_id"),
  direction: text().notNull().default("outgoing"),
  /** text | image | video | audio | document | sticker | location | contact | poll | raw */
  type: text().notNull(),
  body: text(),
  status: text().notNull().default("sent"),
  error: text(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Inbound webhook subscriptions, delivered on every matching event. */
export const webhooksTable = sqliteTable("webhooks", {
  id: text().primaryKey(),
  url: text().notNull(),
  /** Comma-separated event names, or "*" for all. */
  events: text().notNull().default("*"),
  secret: text(),
  active: integer({ mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;
export type Webhook = typeof webhooksTable.$inferSelect;
export type NewWebhook = typeof webhooksTable.$inferInsert;
