import { Hono } from 'hono';
import { cors } from 'hono/cors';
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

console.log(`🚀 微信 AI 助手启动在 http://localhost:${config.PORT}`);
console.log(`   公众号 Webhook: http://localhost:${config.PORT}/api/wechat/mp`);
console.log(`   小程序 API:     http://localhost:${config.PORT}/api/miniapp/*`);
console.log(`   健康检查:       http://localhost:${config.PORT}/health`);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
