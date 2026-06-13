import { redis } from '../data/redis.js';

export class RateLimiter {
  async acquireUserLock(userId: string): Promise<boolean> {
    const key = `lock:user:${userId}`;
    const acquired = await redis.set(key, '1', 'EX', 120, 'NX');
    return acquired === 'OK';
  }

  async releaseUserLock(userId: string): Promise<void> {
    await redis.del(`lock:user:${userId}`);
  }

  async acquireGlobalLock(): Promise<boolean> {
    const key = 'lock:global';
    const acquired = await redis.set(key, '1', 'EX', 10, 'NX');
    return acquired === 'OK';
  }

  async releaseGlobalLock(): Promise<void> {
    await redis.del('lock:global');
  }
}

export const rateLimiter = new RateLimiter();
