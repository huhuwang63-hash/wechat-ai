import OpenAI from 'openai';
import { loadConfig } from '../config/index.js';

const config = loadConfig();

export const openai = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
});

export interface StreamCallInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export async function createStream(input: StreamCallInput) {
  return await openai.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: input.maxTokens ?? 4096,
    temperature: input.temperature ?? 0.7,
    messages: [
      { role: 'system', content: input.system },
      ...input.messages,
    ],
    stream: true,
  });
}

export async function callDeepSeek(input: StreamCallInput): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: input.maxTokens ?? 4096,
    temperature: input.temperature ?? 0.7,
    messages: [
      { role: 'system', content: input.system },
      ...input.messages,
    ],
  });

  return {
    content: response.choices[0]?.message?.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}
