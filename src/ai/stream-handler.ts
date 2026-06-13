const FLUSH_INTERVAL_MS = 150;
const MIN_TOKENS_BEFORE_FLUSH = 4;

type RawStreamEvent = {
  type: string;
  delta?: { type: string; text?: string };
};

export class StreamHandler {
  private buffer = '';
  private accumulatedText = '';
  private tokenCount = 0;
  private lastFlush = Date.now();

  async process(
    stream: AsyncIterable<RawStreamEvent>,
    onFlush: (text: string) => Promise<void>,
    onDone: (fullText: string) => Promise<void>,
  ): Promise<void> {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const text = event.delta.text ?? '';
        this.buffer += text;
        this.accumulatedText += text;
        this.tokenCount++;

        const sinceLastFlush = Date.now() - this.lastFlush;
        if (this.tokenCount >= MIN_TOKENS_BEFORE_FLUSH || sinceLastFlush >= FLUSH_INTERVAL_MS) {
          await this.flush(onFlush);
        }
      }
    }

    if (this.buffer.length > 0) {
      await this.flush(onFlush);
    }

    await onDone(this.accumulatedText);
  }

  private async flush(onFlush: (text: string) => Promise<void>): Promise<void> {
    if (this.buffer.length === 0) return;
    const text = this.buffer;
    this.buffer = '';
    this.tokenCount = 0;
    this.lastFlush = Date.now();
    await onFlush(text);
  }
}
