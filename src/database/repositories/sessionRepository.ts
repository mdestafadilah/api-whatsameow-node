import { desc, eq } from "drizzle-orm";
import { db } from "@/database/db";
import { sessionsTable, type NewSession, type Session } from "@/database/schema";

class SessionRepository {
  async getAll(): Promise<Session[]> {
    return db.select().from(sessionsTable).orderBy(desc(sessionsTable.createdAt));
  }

  async findById(id: string): Promise<Session | undefined> {
    const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1);
    return rows[0];
  }

  async add(session: NewSession): Promise<Session> {
    const rows = await db.insert(sessionsTable).values(session).returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewSession>): Promise<Session | null> {
    const rows = await db
      .update(sessionsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async remove(id: string): Promise<void> {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  }
}

export const sessionRepository = new SessionRepository();
