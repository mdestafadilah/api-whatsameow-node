import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/database/db";
import { messagesTable, type Message, type NewMessage } from "@/database/schema";

export type MessageQuery = {
  sessionId?: string;
  chatJid?: string;
  direction?: string;
  type?: string;
  search?: string;
  limit: number;
  offset: number;
};

class MessageRepository {
  async list(query: MessageQuery): Promise<{ items: Message[]; total: number }> {
    const filters = [
      query.sessionId ? eq(messagesTable.sessionId, query.sessionId) : undefined,
      query.chatJid ? eq(messagesTable.chatJid, query.chatJid) : undefined,
      query.direction ? eq(messagesTable.direction, query.direction) : undefined,
      query.type ? eq(messagesTable.type, query.type) : undefined,
      query.search ? or(like(messagesTable.body, `%${query.search}%`)) : undefined,
    ].filter(Boolean);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const items = await db
      .select()
      .from(messagesTable)
      .where(where)
      .orderBy(desc(messagesTable.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const [counted] = await db
      .select({ value: sql<number>`count(*)` })
      .from(messagesTable)
      .where(where);

    return { items, total: Number(counted?.value ?? 0) };
  }

  async add(message: NewMessage): Promise<Message> {
    const rows = await db.insert(messagesTable).values(message).returning();
    return rows[0];
  }

  /** Distinct chats seen for a session, newest activity first. */
  async listChats(sessionId: string, limit: number) {
    return db
      .select({
        chatJid: messagesTable.chatJid,
        lastMessageAt: sql<number>`max(${messagesTable.createdAt})`,
        messageCount: sql<number>`count(*)`,
      })
      .from(messagesTable)
      .where(eq(messagesTable.sessionId, sessionId))
      .groupBy(messagesTable.chatJid)
      .orderBy(desc(sql`max(${messagesTable.createdAt})`))
      .limit(limit);
  }
}

export const messageRepository = new MessageRepository();
