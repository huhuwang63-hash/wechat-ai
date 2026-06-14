import { userRepo } from '../data/repositories/user.js';
import { quotaLogRepo } from '../data/repositories/quota-log.js';
import { redis } from '../data/redis.js';

export const userService = {
  async getOrCreateMpUser(openid: string): Promise<string> {
    const user = await userRepo.findOrCreate({
      openid,
      platform: 'mp',
    });
    return user.id;
  },

  async getOrCreateMiniappUser(openid: string, nickname?: string, avatarUrl?: string): Promise<string> {
    const user = await userRepo.findOrCreate({
      openid,
      platform: 'miniapp',
      nickname,
      avatarUrl,
    });
    return user.id;
  },

  async checkQuota(userId: string): Promise<{ remaining: number; allowed: boolean }> {
    const cached = await redis.get(`ratelimit:${userId}`);
    const used = cached ? parseInt(cached, 10) : 0;

    const user = await userRepo.findById(userId);
    if (!user) return { remaining: 0, allowed: false };

    const remaining = user.quotaDaily - used;
    return { remaining: Math.max(0, remaining), allowed: remaining > 0 };
  },

  // Atomically check AND consume tokens to prevent race conditions
  async checkAndConsume(userId: string, tokens: number, action = 'chat'): Promise<{ allowed: boolean; remaining: number }> {
    const key = `ratelimit:${userId}`;

    // Atomic increment via Redis
    const newUsed = await redis.incrby(key, tokens);
    // Set TTL to end of day (only if key was just created, NX handles existing)
    await redis.expireat(key, getEndOfDay());

    const user = await userRepo.findById(userId);
    if (!user) return { allowed: false, remaining: 0 };

    const remaining = user.quotaDaily - newUsed;

    if (remaining < 0) {
      // Rollback the atomic increment
      await redis.decrby(key, tokens);
      return { allowed: false, remaining: 0 };
    }

    // Record the consumption in DB
    await quotaLogRepo.create({ userId, tokensUsed: tokens, action });

    return { allowed: true, remaining };
  },

  async getTodayUsedTokens(userId: string): Promise<number> {
    const cached = await redis.get(`ratelimit:${userId}`);
    return cached ? parseInt(cached, 10) : 0;
  },
};

function getEndOfDay(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.floor(end.getTime() / 1000);
}
