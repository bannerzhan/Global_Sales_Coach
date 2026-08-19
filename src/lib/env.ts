import { z } from "zod";

/**
 * 环境变量校验（Zod）。
 * 启动即校验，缺失直接抛错，避免运行时踩坑。
 * 仅服务端使用（勿从客户端组件 import）。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // 火山方舟
  ARK_API_KEY: z.string().min(1, "ARK_API_KEY 缺失"),
  ARK_BASE_URL: z
    .string()
    .url()
    .default("https://ark.cn-beijing.volces.com/api/v3"),
  // 接入点 ID（ep- 开头）优先；没有接入点就退到模型 ID
  ARK_ENDPOINT_PRO: z.string().optional(),
  ARK_ENDPOINT_TURBO: z.string().optional(),
  ARK_ENDPOINT_FLASH: z.string().optional(),
  ARK_MODEL_PRO: z.string().optional(),
  ARK_MODEL_TURBO: z.string().optional(),
  ARK_MODEL_FLASH: z.string().optional(),

  // 数据库
  DATABASE_URL: z.string().min(1, "DATABASE_URL 缺失"),

  // Auth.js 单用户登录
  AUTH_SECRET: z.string().min(8, "AUTH_SECRET 太短"),
  // 登录邮箱（用户名）
  AUTH_USER_EMAIL: z.string().email("AUTH_USER_EMAIL 非法").default("admin@gsc.local"),
  // bcrypt hash（生成: htpasswd -bnBC 10 "" '密码' | tr -d ':\n'）
  AUTH_USER_PASSWORD_HASH: z
    .string()
    .min(20, "AUTH_USER_PASSWORD_HASH 缺失或格式错误"),
  // 注册邀请码（朋友间邀请；空串 = 关闭注册）
  INVITE_CODE: z.string().default("gsc-invite-2026"),

  // 火山语音（ASR/TTS，独立产品线 openspeech.bytedance.com，key 与方舟 ARK key 不同）
  VOICE_API_KEY: z.string().optional(),
  VOICE_ASR_RESOURCE_ID: z.string().default("volc.bigasr.auc_turbo"),
  VOICE_TTS_RESOURCE_ID: z.string().default("seed-tts-2.0"),
  VOICE_TTS_SPEAKER: z.string().default("zh_female_gaolengyujie_uranus_bigtts"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`环境变量校验失败: ${missing}`);
}

export const env = parsed.data;

/** 当前环境是否生产 */
export const isProd = env.NODE_ENV === "production";
