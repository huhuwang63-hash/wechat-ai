import Redis from 'ioredis';
import { loadConfig } from '../config/index.js';

const config = loadConfig();

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

let redisAvailable = false;

const realRedis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 1) return null;
    return 200;
  },
  lazyConnect: true,
});

realRedis.on('error', () => {
  redisAvailable = false;
});

// Try to connect, if fails use memory fallback
realRedis.connect().then(() => {
  redisAvailable = true;
  console.log('Redis 已连接');
}).catch(() => {
  console.log('Redis 不可用，使用内存模式（重启后数据丢失）');
});

// Wrapped client that falls back to memory
export const redis = {
  async get(key: string): Promise<string | null> {
    if (redisAvailable) {
      try { return await realRedis.get(key); } catch { /* fall through */ }
    }
    const entry = memoryStore.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    memoryStore.delete(key);
    return null;
  },

  async set(key: string, value: string, ...args: string[]): Promise<string | null> {
    if (redisAvailable) {
      try { return await realRedis.set(key, value, ...args as any); } catch { /* fall through */ }
    }
    // Parse EX/NX args for memory store
    let ttl = 300000; // default 5 min
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && args[i + 1]) { ttl = parseInt(args[i + 1]) * 1000; i++; }
      if (args[i] === 'NX') nx = true;
    }
    if (nx && memoryStore.has(key)) return null;
    memoryStore.set(key, { value, expiresAt: Date.now() + ttl });
    return 'OK';
  },

  async setex(key: string, seconds: number, value: string): Promise<string> {
    if (redisAvailable) {
      try { return await realRedis.setex(key, seconds, value); } catch { /* fall through */ }
    }
    memoryStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  },

  async del(key: string): Promise<number> {
    if (redisAvailable) {
      try { return await realRedis.del(key); } catch { /* fall through */ }
    }
    return memoryStore.delete(key) ? 1 : 0;
  },

  async incrby(key: string, increment: number): Promise<number> {
    if (redisAvailable) {
      try { return await realRedis.incrby(key, increment); } catch { /* fall through */ }
    }
    const entry = memoryStore.get(key);
    const current = entry ? parseInt(entry.value) || 0 : 0;
    const newVal = current + increment;
    memoryStore.set(key, { value: String(newVal), expiresAt: Date.now() + 86400000 });
    return newVal;
  },

  async decrby(key: string, decrement: number): Promise<number> {
    if (redisAvailable) {
      try { return await realRedis.decrby(key, decrement); } catch { /* fall through */ }
    }
    const entry = memoryStore.get(key);
    const current = entry ? parseInt(entry.value) || 0 : 0;
    const newVal = current - decrement;
    memoryStore.set(key, { value: String(newVal), expiresAt: Date.now() + 86400000 });
    return newVal;
  },

  async expireat(key: string, timestamp: number): Promise<number> {
    if (redisAvailable) {
      try { return await realRedis.expireat(key, timestamp); } catch { /* fall through */ }
    }
    const ttl = timestamp * 1000 - Date.now();
    const entry = memoryStore.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + Math.max(0, ttl);
    }
    return 1;
  },
};
