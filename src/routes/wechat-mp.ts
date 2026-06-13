import { Hono } from 'hono';
import crypto from 'node:crypto';
import { createWechatConfig } from '../config/wechat.js';
import { loadConfig } from '../config/index.js';
import { parseWechatMessage, routeMessage } from '../core/message-router.js';
import { userService } from '../core/user-service.js';
import { sessionService } from '../core/session-service.js';
import { rateLimiter } from '../core/rate-limiter.js';
import { buildWelcomeMessage, buildQuotaExceededMessage, buildErrorMessage } from '../core/prompt-builder.js';
import { buildPrompt } from '../core/prompt-builder.js';
import { createStream } from '../ai/claude-client.js';
import { StreamHandler } from '../ai/stream-handler.js';
import { estimateTokens } from '../ai/context-manager.js';
import { conversationRepo } from '../data/repositories/conversation.js';
import { redis } from '../data/redis.js';

const config = loadConfig();
const wechatConfig = createWechatConfig(config);

export const wechatMpRoute = new Hono();

// GET: WeChat server verification
wechatMpRoute.get('/api/wechat/mp', async (c) => {
  const { signature, timestamp, nonce, echostr } = c.req.query();
  const token = wechatConfig.mp.token;
  const tmpArr = [token, timestamp, nonce].sort();
  const tmpStr = tmpArr.join('');
  const sha1 = crypto.createHash('sha1').update(tmpStr).digest('hex');

  if (sha1 === signature) {
    return c.text(echostr || '');
  }
  return c.text('signature error', 403);
});

// POST: Receive messages
wechatMpRoute.post('/api/wechat/mp', async (c) => {
  const body = await c.req.text();
  const parsed = parseXml(body);
  const message = parseWechatMessage(parsed);
  const route = routeMessage(message);

  if (!route.shouldReply) {
    return c.text('success');
  }

  // Return empty immediately to prevent WeChat 5s retry
  c.executionCtx.waitUntil(handleMpMessage(route.parsed));
  return c.text('');
});

async function handleMpMessage(parsed: { fromUser: string; content: string; type: string }): Promise<void> {
  const openid = parsed.fromUser;

  const locked = await rateLimiter.acquireUserLock(openid);
  if (!locked) return;

  try {
    const userId = await userService.getOrCreateMpUser(openid);

    const quota = await userService.checkQuota(userId);
    if (!quota.allowed) {
      await sendCustomMessage(openid, buildQuotaExceededMessage());
      return;
    }

    // Handle special commands
    if (parsed.content.trim() === '新对话' || parsed.content.trim() === '/new') {
      await sessionService.startNewSession(openid, userId);
      await sendCustomMessage(openid, '✅ 已开启新对话');
      return;
    }

    const session = await sessionService.getOrCreateSession(openid, userId);

    // Handle subscribe event
    if (parsed.type === 'event' && parsed.content === 'subscribe') {
      await sendCustomMessage(openid, buildWelcomeMessage());
      return;
    }

    // Save user message
    const userTokens = estimateTokens(parsed.content);
    await sessionService.addMessage(openid, session, 'user', parsed.content, userTokens);

    // Build prompt
    const promptResult = buildPrompt({
      history: session.messages,
      newMessage: parsed.content,
    });

    // Call Claude streaming API
    const stream = createStream({
      system: promptResult.system,
      messages: promptResult.messages as Array<{ role: 'user' | 'assistant'; content: string }>,
    });

    const handler = new StreamHandler();
    let sent = false;

    await handler.process(
      stream as any,
      async (text) => {
        await sendCustomMessage(openid, text);
        sent = true;
      },
      async (fullText) => {
        const outputTokens = estimateTokens(fullText);
        const totalTokens = userTokens + outputTokens;

        await sessionService.addMessage(openid, session, 'assistant', fullText, outputTokens);
        await conversationRepo.addTokens(session.conversationId, totalTokens);
        await userService.consumeTokens(userId, totalTokens);
      },
    );

    if (!sent) {
      await sendCustomMessage(openid, '（AI 未生成回复，请重试）');
    }
  } catch (error) {
    console.error('MP message handling error:', error);
    await sendCustomMessage(openid, buildErrorMessage());
  } finally {
    await rateLimiter.releaseUserLock(openid);
  }
}

async function sendCustomMessage(openid: string, content: string): Promise<void> {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openid,
      msgtype: 'text',
      text: { content },
    }),
  });

  const result = await response.json() as Record<string, unknown>;
  if (result.errcode !== 0) {
    console.error('客服消息发送失败:', result);
  }
}

async function getAccessToken(): Promise<string> {
  const cached = await redis.get('wechat:access_token');
  if (cached) return cached;

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechatConfig.mp.appId}&secret=${wechatConfig.mp.appSecret}`;
  const response = await fetch(url);
  const data = await response.json() as { access_token: string; expires_in: number; errcode?: number; errmsg?: string };

  if (data.errcode) {
    throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  }

  await redis.setex('wechat:access_token', data.expires_in - 300, data.access_token);
  return data.access_token;
}

function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/gs;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    result[key] = value;
  }
  return result;
}
