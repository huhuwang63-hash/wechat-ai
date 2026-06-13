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
    let used = cached ? parseInt(cached, 10) : 0;

    const user = await userRepo.findById(userId);
    if (!user) return { remaining: 0, allowed: false };

    const remaining = user.quotaDaily - used;
    return { remaining: Math.max(0, remaining), allowed: remaining > 0 };
  },

  async consumeTokens(userId: string, tokens: number, action = 'chat'): Promise<void> {
    await redis.incrby(`ratelimit:${userId}`, tokens);
    await redis.expireat(`ratelimit:${userId}`, getEndOfDay());
    await quotaLogRepo.create({ userId, tokensUsed: tokens, action });
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
