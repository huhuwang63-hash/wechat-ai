import { describe, it, expect } from 'vitest';
import { buildPrompt, buildWelcomeMessage } from '../../src/core/prompt-builder.js';

describe('buildPrompt', () => {
  it('returns correct system and messages', () => {
    const result = buildPrompt({
      history: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: '你好' }],
      newMessage: '今天天气怎么样',
    });

    expect(result.system).toContain('AI 助手');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[2]).toEqual({ role: 'user', content: '今天天气怎么样' });
  });

  it('uses custom system prompt when provided', () => {
    const result = buildPrompt({
      systemPrompt: '你是一个编程助手',
      history: [],
      newMessage: 'TypeScript 怎么写 interface',
    });

    expect(result.system).toBe('你是一个编程助手');
  });

  it('handles empty history', () => {
    const result = buildPrompt({
      history: [],
      newMessage: 'hello',
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: 'user', content: 'hello' });
  });
});

describe('buildWelcomeMessage', () => {
  it('returns welcome message with emoji', () => {
    const msg = buildWelcomeMessage();
    expect(msg).toContain('👋');
    expect(msg).toContain('AI 助手');
  });
});
