import type { Env } from './index.js';

export function createWechatConfig(env: Env) {
  return {
    mp: {
      appId: env.WECHAT_MP_APPID,
      appSecret: env.WECHAT_MP_SECRET,
      token: env.WECHAT_MP_TOKEN,
      encodingAESKey: env.WECHAT_MP_AES_KEY,
    },
    miniapp: {
      appId: env.WECHAT_MINIA_APPID,
      appSecret: env.WECHAT_MINIA_SECRET,
    },
  };
}

export type WechatConfig = ReturnType<typeof createWechatConfig>;
