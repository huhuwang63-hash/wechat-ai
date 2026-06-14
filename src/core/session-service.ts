import { redis } from '../data/redis.js';
import { randomUUID } from 'crypto';

const SESSION_TTL = 30 * 60;
const MAX_CACHED_MESSAGES = 20;

interface CachedSession {
  conversationId: string;
  messages: Array<{ role: string; content: string }>;
}

export const sessionService = {
  async getOrCreateSession(openid: string, userId: string): Promise<CachedSession> {
    const cacheKey = `session:${openid}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CachedSession;
    }

    // Create new session (no DB needed)
    const session: CachedSession = {
      conversationId: randomUUID(),
      messages: [],
    };
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
    return session;
  },

  async addMessage(openid: string, session: CachedSession, role: string, content: string, tokenCount: number): Promise<void> {
    // Try DB save but don't fail if DB is down
    try {
      const { messageRepo } = await import('../data/repositories/message.js');
      await messageRepo.create({
        conversationId: session.conversationId,
        role,
        content,
        tokenCount,
      });
    } catch { /* DB not available, rely on memory cache */ }

    session.messages.push({ role, content });
    if (session.messages.length > MAX_CACHED_MESSAGES) {
      session.messages = session.messages.slice(-MAX_CACHED_MESSAGES);
    }

    const cacheKey = `session:${openid}`;
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
  },

  async startNewSession(openid: string, userId: string, systemPrompt?: string): Promise<CachedSession> {
    // Try DB but don't fail
    try {
      const { conversationRepo } = await import('../data/repositories/conversation.js');
      await conversationRepo.create({
        userId,
        title: '新对话',
        model: 'deepseek-chat',
        systemPrompt,
      });
    } catch { /* DB not available */ }

    const session: CachedSession = {
      conversationId: randomUUID(),
      messages: [],
    };
    const cacheKey = `session:${openid}`;
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
    return session;
  },
};
