import { describe, it, expect } from 'vitest';
import { parseWechatMessage, routeMessage } from '../../src/core/message-router.js';

describe('parseWechatMessage', () => {
  it('parses text message correctly', () => {
    const xml = {
      ToUserName: 'gh_xxx',
      FromUserName: 'oABC123',
      CreateTime: '1234567890',
      MsgType: 'text',
      Content: '你好',
      MsgId: '12345',
    };

    const result = parseWechatMessage(xml);
    expect(result.type).toBe('text');
    expect(result.content).toBe('你好');
    expect(result.fromUser).toBe('oABC123');
  });

  it('parses image message correctly', () => {
    const xml = {
      ToUserName: 'gh_xxx',
      FromUserName: 'oABC123',
      CreateTime: '1234567890',
      MsgType: 'image',
      PicUrl: 'http://example.com/pic.jpg',
      MsgId: '12345',
    };

    const result = parseWechatMessage(xml);
    expect(result.type).toBe('image');
  });

  it('handles voice message with Recognition', () => {
    const xml = {
      ToUserName: 'gh_xxx',
      FromUserName: 'oABC123',
      CreateTime: '1234567890',
      MsgType: 'voice',
      Recognition: '语音转文字结果',
    };

    const result = parseWechatMessage(xml);
    expect(result.type).toBe('voice');
    expect(result.content).toBe('语音转文字结果');
  });
});

describe('routeMessage', () => {
  it('text messages should be replied', () => {
    const parsed = {
      type: 'text' as const,
      content: 'hello',
      raw: {},
      fromUser: 'oABC',
      createTime: 123,
    };

    const result = routeMessage(parsed);
    expect(result.shouldReply).toBe(true);
  });

  it('image messages should be replied', () => {
    const parsed = {
      type: 'image' as const,
      content: '',
      raw: {},
      fromUser: 'oABC',
      createTime: 123,
    };

    const result = routeMessage(parsed);
    expect(result.shouldReply).toBe(true);
  });

  it('subscribe event should be replied', () => {
    const parsed = {
      type: 'event' as const,
      content: 'subscribe',
      raw: { Event: 'subscribe' },
      fromUser: 'oABC',
      createTime: 123,
    };

    const result = routeMessage(parsed);
    expect(result.shouldReply).toBe(true);
  });

  it('unsubscribe event should NOT be replied', () => {
    const parsed = {
      type: 'event' as const,
      content: '',
      raw: { Event: 'unsubscribe' },
      fromUser: 'oABC',
      createTime: 123,
    };

    const result = routeMessage(parsed);
    expect(result.shouldReply).toBe(false);
  });

  it('unknown message type should not be replied', () => {
    const parsed = {
      type: 'unknown' as const,
      content: '',
      raw: {},
      fromUser: 'oABC',
      createTime: 123,
    };

    const result = routeMessage(parsed);
    expect(result.shouldReply).toBe(false);
  });
});
