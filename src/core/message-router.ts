export type MessageType = 'text' | 'image' | 'voice' | 'event' | 'unknown';

export interface ParsedMessage {
  type: MessageType;
  content: string;
  raw: Record<string, unknown>;
  fromUser: string;
  createTime: number;
  msgId?: string;
}

export interface RouteResult {
  shouldReply: boolean;
  parsed: ParsedMessage;
}

export function parseWechatMessage(xmlBody: Record<string, string>): ParsedMessage {
  const msgType = xmlBody.MsgType || 'unknown';
  const type = mapMsgType(msgType);

  return {
    type,
    content: xmlBody.Content || xmlBody.Recognition || '',
    raw: xmlBody as unknown as Record<string, unknown>,
    fromUser: xmlBody.FromUserName || '',
    createTime: parseInt(xmlBody.CreateTime || '0', 10),
    msgId: xmlBody.MsgId,
  };
}

export function routeMessage(parsed: ParsedMessage): RouteResult {
  switch (parsed.type) {
    case 'text':
      return { shouldReply: true, parsed };
    case 'image':
      return { shouldReply: true, parsed };
    case 'voice':
      return { shouldReply: true, parsed };
    case 'event':
      return handleEvent(parsed);
    default:
      return { shouldReply: false, parsed };
  }
}

function handleEvent(parsed: ParsedMessage): RouteResult {
  const event = (parsed.raw as Record<string, string>).Event || '';
  switch (event.toLowerCase()) {
    case 'subscribe':
      return { shouldReply: true, parsed: { ...parsed, type: 'event', content: 'subscribe' } };
    case 'unsubscribe':
      return { shouldReply: false, parsed };
    case 'click':
      return { shouldReply: true, parsed: { ...parsed, type: 'event', content: (parsed.raw as Record<string, string>).MenuKey || 'click' } };
    default:
      return { shouldReply: false, parsed };
  }
}

function mapMsgType(type: string): MessageType {
  switch (type) {
    case 'text': return 'text';
    case 'image': return 'image';
    case 'voice': return 'voice';
    case 'event': return 'event';
    default: return 'unknown';
  }
}
