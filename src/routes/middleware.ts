import type { Context, Next } from 'hono';

export async function errorHandler(c: Context, next: Next): Promise<Response | void> {
  try {
    await next();
  } catch (error) {
    console.error('Unhandled error:', error);

    if (error instanceof Error) {
      if (error.message.includes('rate_limit') || error.message.includes('overloaded')) {
        c.status(429);
        return c.json({ error: 'AI 暂时繁忙，请稍后重试' });
      }
      if (error.message.includes('timeout')) {
        c.status(504);
        return c.json({ error: 'AI 响应超时，请重试' });
      }
    }

    c.status(500);
    return c.json({ error: '服务异常，请稍后重试' });
  }
}

export async function logger(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${c.req.method} ${c.req.url} → ${c.res.status} (${duration}ms)`);
}
