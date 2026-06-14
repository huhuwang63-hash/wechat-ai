import { z } from 'zod';

// Load .env file in development (Node.js 21.7+)
try { process.loadEnvFile?.(); } catch { /* ignore */ }

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DEEPSEEK_API_KEY: z.string().min(1),
  WECHAT_MP_APPID: z.string().min(1),
  WECHAT_MP_SECRET: z.string().min(1),
  WECHAT_MP_TOKEN: z.string().min(1),
  WECHAT_MP_AES_KEY: z.string().optional(),
  WECHAT_MINIA_APPID: z.string().min(1),
  WECHAT_MINIA_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('环境变量校验失败:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
