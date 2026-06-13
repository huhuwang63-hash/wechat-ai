import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/index.js';

const config = loadConfig();

export const anthropic = new Anthropic({
  apiKey: config.CLAUDE_API_KEY,
});

export interface StreamCallInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export function createStream(input: StreamCallInput) {
  return anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: input.maxTokens ?? 4096,
    temperature: input.temperature ?? 0.7,
    system: input.system,
    messages: input.messages,
  });
}

export async function callClaude(input: StreamCallInput): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: input.maxTokens ?? 4096,
    temperature: input.temperature ?? 0.7,
    system: input.system,
    messages: input.messages,
  });

  return {
    content: response.content.map(block => {
      if (block.type === 'text') return block.text;
      return '';
    }).join(''),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
