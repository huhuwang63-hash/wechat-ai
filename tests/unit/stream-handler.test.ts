import { describe, it, expect } from 'vitest';
import { StreamHandler } from '../../src/ai/stream-handler.js';

function createMockStream(events: Array<{ type: string; delta?: { type: string; text?: string } }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe('StreamHandler', () => {
  it('accumulates and flushes all tokens', async () => {
    const handler = new StreamHandler();
    const flushed: string[] = [];
    let doneText = '';

    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '世界' } },
    ];

    await handler.process(
      createMockStream(events),
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

    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'A' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'B' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'C' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'D' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'E' } },
    ];

    await handler.process(
      createMockStream(events),
      async (text) => { flushed.push(text); },
      async (fullText) => { doneText = fullText; },
    );

    expect(doneText).toBe('ABCDE');
    expect(flushed.length).toBeGreaterThan(0);
  });

  it('non-text-delta events are ignored', async () => {
    const handler = new StreamHandler();
    let doneText = '';

    const events = [
      { type: 'content_block_start' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
      { type: 'content_block_stop' },
    ];

    await handler.process(
      createMockStream(events),
      async () => {},
      async (fullText) => { doneText = fullText; },
    );

    expect(doneText).toBe('Hi');
  });
});
