import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { conversations } from '../schema.js';

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export const conversationRepo = {
  async findById(id: string): Promise<ConversationRow | undefined> {
    return db.query.conversations.findFirst({ where: eq(conversations.id, id) });
  },

  async findByUserId(userId: string, limit = 20): Promise<ConversationRow[]> {
    return db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: desc(conversations.updatedAt),
      limit,
    });
  },

  async create(data: NewConversation): Promise<ConversationRow> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  },

  async delete(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async addTokens(id: string, tokens: number): Promise<void> {
    await db.update(conversations)
      .set({
        totalTokens: sql`${conversations.totalTokens} + ${tokens}`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, id));
  },
};
