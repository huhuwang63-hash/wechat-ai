import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer } from 'http';
import { wechatMpRoute } from './routes/wechat-mp.js';
import { wechatMiniappRoute } from './routes/wechat-miniapp.js';
import { errorHandler, logger } from './routes/middleware.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();

const app = new Hono();

// Global middleware
app.use('*', errorHandler);
app.use('*', logger);
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Mount routes
app.route('/', wechatMpRoute);
app.route('/', wechatMiniappRoute);

// Start HTTP server
const server = createServer(async (req, res) => {
  // Build Web Request from Node.js IncomingMessage
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }
  const method = req.method || 'GET';
  const body = method !== 'GET' && method !== 'HEAD' ? await readBody(req) : undefined;
  const webRequest = new Request(url, { method, headers, body });

  const response = await app.fetch(webRequest);

  // Write response
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      await pump();
    };
    await pump();
  } else {
    res.end();
  }
});

server.listen(config.PORT, () => {
  console.log(`🚀 微信 AI 助手启动在 http://localhost:${config.PORT}`);
  console.log(`   公众号 Webhook: http://localhost:${config.PORT}/api/wechat/mp`);
  console.log(`   小程序 API:     http://localhost:${config.PORT}/api/miniapp/*`);
  console.log(`   健康检查:       http://localhost:${config.PORT}/health`);
});

function readBody(req: any): Promise<BodyInit | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}
