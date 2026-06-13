import { redis } from '../data/redis.js';
import { conversationRepo } from '../data/repositories/conversation.js';
import { messageRepo } from '../data/repositories/message.js';

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

    const recentConversations = await conversationRepo.findByUserId(userId, 1);
    const latest = recentConversations[0];

    if (latest) {
      const msgs = await messageRepo.findByConversationId(latest.id, MAX_CACHED_MESSAGES);
      const session: CachedSession = {
        conversationId: latest.id,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
      };
      await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
      return session;
    }

    const conv = await conversationRepo.create({
      userId,
      title: '新对话',
      model: 'claude-sonnet-4-6',
    });

    const session: CachedSession = { conversationId: conv.id, messages: [] };
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
    return session;
  },

  async addMessage(openid: string, session: CachedSession, role: string, content: string, tokenCount: number): Promise<void> {
    await messageRepo.create({
      conversationId: session.conversationId,
      role,
      content,
      tokenCount,
    });

    session.messages.push({ role, content });
    if (session.messages.length > MAX_CACHED_MESSAGES) {
      session.messages = session.messages.slice(-MAX_CACHED_MESSAGES);
    }

    const cacheKey = `session:${openid}`;
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
  },

  async startNewSession(openid: string, userId: string, systemPrompt?: string): Promise<CachedSession> {
    const conv = await conversationRepo.create({
      userId,
      title: '新对话',
      model: 'claude-sonnet-4-6',
      systemPrompt,
    });

    const session: CachedSession = { conversationId: conv.id, messages: [] };
    const cacheKey = `session:${openid}`;
    await redis.setex(cacheKey, SESSION_TTL, JSON.stringify(session));
    return session;
  },
};
