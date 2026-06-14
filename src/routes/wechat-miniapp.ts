import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createWechatConfig } from '../config/wechat.js';
import { loadConfig } from '../config/index.js';
import * as jose from 'jose';
import { userService } from '../core/user-service.js';
import { sessionService } from '../core/session-service.js';
import { buildPrompt, buildQuotaExceededMessage } from '../core/prompt-builder.js';
import { createStream } from '../ai/claude-client.js';
import { StreamHandler } from '../ai/stream-handler.js';
import { estimateTokens } from '../ai/context-manager.js';
import { conversationRepo } from '../data/repositories/conversation.js';
import { messageRepo } from '../data/repositories/message.js';

const config = loadConfig();
const wechatConfig = createWechatConfig(config);

export const wechatMiniappRoute = new Hono();

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(secret);
}

// JWT auth middleware
async function jwtAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }

  const token = authHeader.slice(7);
  const secret = new TextEncoder().encode(config.JWT_SECRET);

  try {
    const { payload } = await jose.jwtVerify(token, secret);
    (c as any).set('userId', payload.sub);
    (c as any).set('openid', payload.openid);
    await next();
  } catch {
    return c.json({ error: '登录已过期' }, 401);
  }
}

// POST /api/miniapp/login
wechatMiniappRoute.post('/api/miniapp/login', async (c) => {
  const { code, nickname, avatarUrl } = await c.req.json<{
    code: string;
    nickname?: string;
    avatarUrl?: string;
  }>();

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${wechatConfig.miniapp.appId}&secret=${wechatConfig.miniapp.appSecret}&js_code=${code}&grant_type=authorization_code`;
  const response = await fetch(url);
  const sessionData = await response.json() as {
    openid?: string;
    session_key?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (sessionData.errcode || !sessionData.openid) {
    return c.json({ error: '登录失败' }, 400);
  }

  const userId = await userService.getOrCreateMiniappUser(
    sessionData.openid,
    nickname,
    avatarUrl,
  );

  const jwt = await signJwt({ sub: userId, openid: sessionData.openid });
  return c.json({ token: jwt, userId });
});

// POST /api/miniapp/chat (SSE streaming)
wechatMiniappRoute.post('/api/miniapp/chat', jwtAuth, async (c) => {
  const { message, conversationId } = await c.req.json<{
    message: string;
    conversationId?: string;
  }>();

  const userId = (c as any).get('userId') as string;
  const openid = (c as any).get('openid') as string;

  const quota = await userService.checkQuota(userId);
  if (!quota.allowed) {
    return c.json({ error: '今日用量已达上限' }, 429);
  }

  let session;
  if (conversationId) {
    const conv = await conversationRepo.findById(conversationId);
    if (!conv || conv.userId !== userId) {
      return c.json({ error: '会话不存在' }, 404);
    }
    const msgs = await messageRepo.findByConversationId(conversationId);
    session = { conversationId, messages: msgs.map(m => ({ role: m.role, content: m.content })) };
  } else {
    session = await sessionService.getOrCreateSession(openid, userId);
  }

  const userTokens = estimateTokens(message);
  await sessionService.addMessage(openid, session, 'user', message, userTokens);

  const promptResult = buildPrompt({
    history: session.messages,
    newMessage: message,
  });

  const stream = createStream({
    system: promptResult.system,
    messages: promptResult.messages as Array<{ role: 'user' | 'assistant'; content: string }>,
  });

  return streamSSE(c, async (sse) => {
    const handler = new StreamHandler();

    await handler.process(
      stream as any,
      async (text) => {
        await sse.writeSSE({ data: text });
      },
      async (fullText) => {
        const outputTokens = estimateTokens(fullText);
        const totalTokens = userTokens + outputTokens;

        await sessionService.addMessage(openid, session, 'assistant', fullText, outputTokens);
        await conversationRepo.addTokens(session.conversationId, totalTokens);
        await userService.checkAndConsume(userId, totalTokens);

        await sse.writeSSE({ data: '[DONE]' });
      },
    );
  });
});

// GET /api/miniapp/conversations
wechatMiniappRoute.get('/api/miniapp/conversations', jwtAuth, async (c) => {
  const userId = (c as any).get('userId') as string;
  const conversations = await conversationRepo.findByUserId(userId);
  return c.json({ conversations });
});

// GET /api/miniapp/conversations/:id
wechatMiniappRoute.get('/api/miniapp/conversations/:id', jwtAuth, async (c) => {
  const id = c.req.param('id');
  const userId = (c as any).get('userId') as string;
  const conv = await conversationRepo.findById(id);
  if (!conv || conv.userId !== userId) {
    return c.json({ error: '会话不存在' }, 404);
  }
  const messages = await messageRepo.findByConversationId(id);
  return c.json({ messages });
});

// POST /api/miniapp/conversations
wechatMiniappRoute.post('/api/miniapp/conversations', jwtAuth, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { title, systemPrompt } = await c.req.json<{ title?: string; systemPrompt?: string }>();
  const conv = await conversationRepo.create({
    userId,
    title: title || '新对话',
    systemPrompt,
  });
  return c.json(conv, 201);
});

// DELETE /api/miniapp/conversations/:id
wechatMiniappRoute.delete('/api/miniapp/conversations/:id', jwtAuth, async (c) => {
  const id = c.req.param('id');
  const userId = (c as any).get('userId') as string;
  const conv = await conversationRepo.findById(id);
  if (!conv || conv.userId !== userId) {
    return c.json({ error: '会话不存在' }, 404);
  }
  await conversationRepo.delete(id);
  return c.body(null, 204);
});

// GET /api/miniapp/user/quota
wechatMiniappRoute.get('/api/miniapp/user/quota', jwtAuth, async (c) => {
  const userId = (c as any).get('userId') as string;
  const quota = await userService.checkQuota(userId);
  const todayUsed = await userService.getTodayUsedTokens(userId);
  return c.json({ remaining: quota.remaining, todayUsed });
});
