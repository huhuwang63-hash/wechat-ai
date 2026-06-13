import { eq, asc, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { messages } from '../schema.js';

export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export const messageRepo = {
  async findByConversationId(conversationId: string, limit = 50): Promise<MessageRow[]> {
    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: asc(messages.createdAt),
      limit,
    });
  },

  async create(data: NewMessage): Promise<MessageRow> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  },

  async getRecentTokens(conversationId: string): Promise<number> {
    const recentMsgs = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: desc(messages.createdAt),
      limit: 20,
    });
    return recentMsgs.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  },
};
