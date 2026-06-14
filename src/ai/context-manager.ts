const MAX_CONTEXT_TOKENS = 8000;
const SUMMARY_EVERY_N_ROUNDS = 10;

interface ContextMessage {
  role: string;
  content: string;
  tokenCount: number;
}

export function shouldSummarize(messages: ContextMessage[], totalTokens: number): boolean {
  if (totalTokens <= MAX_CONTEXT_TOKENS) return false;
  if (messages.length < SUMMARY_EVERY_N_ROUNDS * 2) return false;
  return true;
}

export function slidingWindow(messages: ContextMessage[], maxTokens: number = MAX_CONTEXT_TOKENS): ContextMessage[] {
  let tokenSum = 0;
  const kept: ContextMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    if (tokenSum + messages[i].tokenCount <= maxTokens) {
      tokenSum += messages[i].tokenCount;
      kept.unshift(messages[i]);
    } else {
      break;
    }
  }

  return kept;
}

export async function generateSummary(messages: ContextMessage[]): Promise<string> {
  // Lazy import to avoid triggering loadConfig() at module-load time
  const { callDeepSeek } = await import('./deepseek-client.js');

  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const result = await callDeepSeek({
    system: '你是一个对话摘要工具。请用简洁的一段话（不超过 200 字）总结以下对话的要点。',
    messages: [{ role: 'user', content: `请总结这段对话：\n${conversationText}` }],
    maxTokens: 300,
    temperature: 0.3,
  });

  return `[历史摘要] ${result.content}`;
}

export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars + otherChars * 0.25);
}
