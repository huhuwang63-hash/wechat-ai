import { Hono } from 'hono';
import crypto from 'node:crypto';
import { createWechatConfig } from '../config/wechat.js';
import { loadConfig } from '../config/index.js';
import { parseWechatMessage, routeMessage } from '../core/message-router.js';
import { userService } from '../core/user-service.js';
import { sessionService } from '../core/session-service.js';
import { rateLimiter } from '../core/rate-limiter.js';
import { buildPrompt, buildWelcomeMessage, buildQuotaExceededMessage, buildErrorMessage } from '../core/prompt-builder.js';
import { createStream } from '../ai/deepseek-client.js';
import { StreamHandler } from '../ai/stream-handler.js';
import { estimateTokens } from '../ai/context-manager.js';
import { redis } from '../data/redis.js';

const config = loadConfig();
const wechatConfig = createWechatConfig(config);

export const wechatMpRoute = new Hono();

// ===== GET: WeChat server verification =====
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

// ===== POST: Receive messages =====
wechatMpRoute.post('/api/wechat/mp', async (c) => {
  const body = await c.req.text();
  const parsed = parseXml(body);
  const message = parseWechatMessage(parsed);
  const route = routeMessage(message);

  if (!route.shouldReply) {
    c.executionCtx.waitUntil(Promise.resolve());
    return c.text('success');
  }

  // Fire-and-forget: return immediately to avoid WeChat 5s timeout
  handleMpMessage(route.parsed).catch(err => {
    console.error('handleMpMessage error:', err?.message || err);
  });
  return c.text('success');
});

// ===== Core: process a WeChat message and reply via AI =====
async function handleMpMessage(parsed: { fromUser: string; content: string; type: string }): Promise<void> {
  const openid = parsed.fromUser;

  const locked = await rateLimiter.acquireUserLock(openid);
  if (!locked) return;

  try {
    const userId = await userService.getOrCreateMpUser(openid);

    const quotaCheck = await userService.checkQuota(userId);
    if (!quotaCheck.allowed) {
      await sendCustomMessage(openid, buildQuotaExceededMessage());
      return;
    }

    if (parsed.content.trim() === '新对话' || parsed.content.trim() === '/new') {
      await sessionService.startNewSession(openid, userId);
      await sendCustomMessage(openid, '✅ 已开启新对话');
      return;
    }

    if (parsed.type === 'event' && parsed.content === 'subscribe') {
      await sendCustomMessage(openid, buildWelcomeMessage());
      return;
    }

    const session = await sessionService.getOrCreateSession(openid, userId);

    const userTokens = estimateTokens(parsed.content);
    await sessionService.addMessage(openid, session, 'user', parsed.content, userTokens);

    const promptResult = buildPrompt({
      history: session.messages,
      newMessage: parsed.content,
    });

    const stream = await createStream({
      system: promptResult.system,
      messages: promptResult.messages as Array<{ role: 'user' | 'assistant'; content: string }>,
    });

    const handler = new StreamHandler();
    let batchBuffer = '';
    let totalSentLen = 0;

    await handler.process(
      stream as any,
      async (text) => {
        batchBuffer += text;
        if (batchBuffer.length >= 30) {
          await sendCustomMessage(openid, batchBuffer);
          totalSentLen += batchBuffer.length;
          batchBuffer = '';
          await sleep(800);
        }
      },
      async (completeText) => {
        if (batchBuffer.length > 0) {
          await sendCustomMessage(openid, batchBuffer);
          totalSentLen += batchBuffer.length;
        }
        const outputTokens = estimateTokens(completeText || '');
        const totalTokens = userTokens + outputTokens;
        await sessionService.addMessage(openid, session, 'assistant', completeText || '', outputTokens);
        try {
          const { conversationRepo } = await import('../data/repositories/conversation.js');
          await conversationRepo.addTokens(session.conversationId, totalTokens);
        } catch { /* DB not available */ }
        await userService.checkAndConsume(userId, totalTokens);
      },
    );

    if (totalSentLen === 0) {
      await sendCustomMessage(openid, '（AI 未生成回复，请重试）');
    }
  } catch (error: any) {
    console.error('handleMpMessage error:', error?.message || error);
    try {
      await sendCustomMessage(openid, buildErrorMessage());
    } catch { /* can't send error either */ }
  } finally {
    await rateLimiter.releaseUserLock(openid);
  }
}

// ===== Send custom message to user via WeChat API =====
async function sendCustomMessage(openid: string, content: string): Promise<void> {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ touser: openid, msgtype: 'text', text: { content } }),
  });

  const result = await response.json() as Record<string, unknown>;
  if (result.errcode !== 0) {
    console.error('客服消息发送失败:', result);
  }
}

// ===== Get WeChat access_token =====
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

// ===== Parse WeChat XML message body =====
function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const cdataRegex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/gs;
  let match: RegExpExecArray | null;
  while ((match = cdataRegex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  const plainRegex = /<(\w+)>(.*?)<\/\1>/gs;
  while ((match = plainRegex.exec(xml)) !== null) {
    if (!(match[1] in result) && match[1] !== 'xml') {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
