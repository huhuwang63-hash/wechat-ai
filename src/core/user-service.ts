import { userRepo } from '../data/repositories/user.js';
import { quotaLogRepo } from '../data/repositories/quota-log.js';
import { redis } from '../data/redis.js';
import { randomUUID } from 'crypto';

// In-memory fallback when PostgreSQL is unavailable
const memoryUsers = new Map<string, { id: string; openid: string; quotaDaily: number }>();

export const userService = {
  async getOrCreateMpUser(openid: string): Promise<string> {
    try {
      const user = await userRepo.findOrCreate({
        openid,
        platform: 'mp',
      });
      return user.id;
    } catch (err) {
      console.log('DB 不可用，使用内存用户存储');
      return getOrCreateMemoryUser(openid);
    }
  },

  async getOrCreateMiniappUser(openid: string, nickname?: string, avatarUrl?: string): Promise<string> {
    try {
      const user = await userRepo.findOrCreate({
        openid,
        platform: 'miniapp',
        nickname,
        avatarUrl,
      });
      return user.id;
    } catch (err) {
      console.log('DB 不可用，使用内存用户存储');
      return getOrCreateMemoryUser(openid);
    }
  },

  async checkQuota(userId: string): Promise<{ remaining: number; allowed: boolean }> {
    const cached = await redis.get(`ratelimit:${userId}`);
    const used = cached ? parseInt(cached, 10) : 0;

    try {
      const user = await userRepo.findById(userId);
      if (!user) {
        // Check memory store
        const memUser = memoryUsers.get(userId);
        if (!memUser) return { remaining: 0, allowed: false };
        const remaining = memUser.quotaDaily - used;
        return { remaining: Math.max(0, remaining), allowed: remaining > 0 };
      }
      const remaining = user.quotaDaily - used;
      return { remaining: Math.max(0, remaining), allowed: remaining > 0 };
    } catch {
      const memUser = memoryUsers.get(userId);
      if (!memUser) return { remaining: 100000 - used > 0 ? 100000 - used : 0, allowed: used < 100000 };
      const remaining = memUser.quotaDaily - used;
      return { remaining: Math.max(0, remaining), allowed: remaining > 0 };
    }
  },

  async checkAndConsume(userId: string, tokens: number, action = 'chat'): Promise<{ allowed: boolean; remaining: number }> {
    const key = `ratelimit:${userId}`;
    const newUsed = await redis.incrby(key, tokens);
    await redis.expireat(key, getEndOfDay());

    // Allow consumption (quota is generous for now)
    const quota = 100000;
    const remaining = quota - newUsed;

    if (remaining < 0) {
      await redis.decrby(key, tokens);
      return { allowed: false, remaining: 0 };
    }

    try {
      await quotaLogRepo.create({ userId, tokensUsed: tokens, action });
    } catch { /* DB not available, skip logging */ }

    return { allowed: true, remaining };
  },

  async getTodayUsedTokens(userId: string): Promise<number> {
    const cached = await redis.get(`ratelimit:${userId}`);
    return cached ? parseInt(cached, 10) : 0;
  },
};

function getOrCreateMemoryUser(openid: string): string {
  // Check if already exists
  for (const [id, user] of memoryUsers) {
    if (user.openid === openid) return id;
  }
  // Create new
  const id = randomUUID();
  memoryUsers.set(id, { id, openid, quotaDaily: 100000 });
  return id;
}

function getEndOfDay(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.floor(end.getTime() / 1000);
}
