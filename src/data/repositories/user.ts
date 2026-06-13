import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../schema.js';

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userRepo = {
  async findByOpenid(openid: string): Promise<UserRow | undefined> {
    return db.query.users.findFirst({ where: eq(users.openid, openid) });
  },

  async findById(id: string): Promise<UserRow | undefined> {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  async create(data: NewUser): Promise<UserRow> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  async findOrCreate(data: NewUser): Promise<UserRow> {
    const existing = await userRepo.findByOpenid(data.openid);
    if (existing) {
      await db.update(users)
        .set({ nickname: data.nickname, avatarUrl: data.avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      return userRepo.findById(existing.id) as Promise<UserRow>;
    }
    return userRepo.create(data);
  },

  async updateQuota(userId: string, tokensUsed: number): Promise<void> {
    await db.update(users)
      .set({
        quotaDaily: sql`${users.quotaDaily} - ${tokensUsed}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  },
};
