import Redis from 'ioredis';
import { loadConfig } from '../config/index.js';

const config = loadConfig();

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err) => {
  console.error('Redis 连接错误:', err.message);
});
