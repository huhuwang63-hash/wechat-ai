import { describe, it, expect } from 'vitest';
import { StreamHandler } from '../../src/ai/stream-handler.js';

function createMockStream(chunks: Array<{ choices: Array<{ delta?: { content?: string } }> }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as any;
}

describe('StreamHandler', () => {
  it('accumulates and flushes all tokens', async () => {
    const handler = new StreamHandler();
    const flushed: string[] = [];
    let doneText = '';

    const chunks = [
      { choices: [{ delta: { content: '你好' } }] },
      { choices: [{ delta: { content: '世界' } }] },
    ];

    await handler.process(
      createMockStream(chunks),
      async (text) => { flushed.push(text); },
      async (fullText) => { doneText = fullText; },
    );

    expect(flushed.join('')).toBe('你好世界');
    expect(doneText).toBe('你好世界');
  });

  it('triggers flush after reaching token threshold', async () => {
    const handler = new StreamHandler();
    const flushed: string[] = [];
    let doneText = '';

    const chunks = [
      { choices: [{ delta: { content: 'A' } }] },
      { choices: [{ delta: { content: 'B' } }] },
      { choices: [{ delta: { content: 'C' } }] },
      { choices: [{ delta: { content: 'D' } }] },
      { choices: [{ delta: { content: 'E' } }] },
    ];

    await handler.process(
      createMockStream(chunks),
      async (text) => { flushed.push(text); },
      async (fullText) => { doneText = fullText; },
    );

    expect(doneText).toBe('ABCDE');
    expect(flushed.length).toBeGreaterThan(0);
  });

  it('chunks without content are ignored', async () => {
    const handler = new StreamHandler();
    let doneText = '';

    const chunks = [
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: 'Hi' } }] },
      { choices: [] },
    ];

    await handler.process(
      createMockStream(chunks),
      async () => {},
      async (fullText) => { doneText = fullText; },
    );

    expect(doneText).toBe('Hi');
  });
});
