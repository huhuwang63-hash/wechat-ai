import type { MessageParam } from '@anthropic-ai/sdk/resources/index.js';
import { slidingWindow, estimateTokens } from '../ai/context-manager.js';

const DEFAULT_SYSTEM_PROMPT = `你是一个有用的 AI 助手，通过微信为用户提供帮助。
你可以回答问题、提供建议、帮助写作、进行头脑风暴等。
请用简洁友好的方式回复。如果用户用中文提问，请用中文回复。
回复时注意微信消息的长度限制，尽量控制在 1000 字以内。`;

const MAX_CONTEXT_TOKENS = 8000;

export interface BuildPromptInput {
  systemPrompt?: string;
  history: Array<{ role: string; content: string }>;
  newMessage: string;
}

export interface BuildPromptResult {
  system: string;
  messages: MessageParam[];
}

export function buildPrompt(input: BuildPromptInput): BuildPromptResult {
  const system = input.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Convert history to context messages for sliding window
  const contextMessages = input.history.map(msg => ({
    role: msg.role,
    content: msg.content,
    tokenCount: estimateTokens(msg.content),
  }));

  // Apply sliding window to prevent context overflow
  const trimmed = slidingWindow(contextMessages, MAX_CONTEXT_TOKENS);

  const messages: MessageParam[] = [];

  for (const msg of trimmed) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  messages.push({ role: 'user', content: input.newMessage });

  return { system, messages };
}

export function buildWelcomeMessage(): string {
  return `👋 你好！我是 AI 助手，基于 Claude 驱动。

你可以：
• 💬 随意聊天问答
• 📝 写作与翻译
• 💡 头脑风暴
• 🔍 分析与建议

直接发送消息即可开始对话。`;
}

export function buildQuotaExceededMessage(): string {
  return '😅 今日用量已达上限，请明天再来。如有需要请联系管理员提升配额。';
}

export function buildErrorMessage(): string {
  return '😔 AI 暂时繁忙，请稍后重试。';
}

export function buildNewSessionMessage(): string {
  return '✅ 已开启新对话，之前的会话已存档。';
}
