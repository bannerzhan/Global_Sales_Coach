/**
 * repo 层类型定义（与 db/init/02-schema.sql 的 profiles/goals 对齐）。
 */

export interface Profile {
  userId: string;
  /** 职位，如 "外贸业务员" */
  occupation: string | null;
  /** 行业，如 "促销礼品" */
  industry: string | null;
  /** 目标市场，如 ["US", "EU"] */
  markets: string[];
  /** 获客渠道，如 ["email", "whatsapp"] */
  channels: string[];
  /** 每天可投入分钟数（5-240） */
  dailyMinutes: number;
  /** 英语水平自评 1-5 */
  englishLevel: {
    reading?: number;
    listening?: number;
    speaking?: number;
    writing?: number;
  };
  locale: string;
  timezone: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  targetDate: string | null;
  status: "active" | "achieved" | "abandoned";
  createdAt: string;
}

/** 英语四维的固定顺序（UI/LLM 建议共用） */
export const ENGLISH_DIMENSIONS = ["reading", "listening", "speaking", "writing"] as const;
export type EnglishDimension = (typeof ENGLISH_DIMENSIONS)[number];

/** 常见目标市场 / 渠道选项（Onboarding UI 用） */
export const MARKET_OPTIONS = ["US", "EU", "东南亚", "中东", "拉美", "非洲", "日本", "韩国"] as const;
export const CHANNEL_OPTIONS = ["email", "WhatsApp", "LinkedIn", "展会", "独立站", "TikTok", "电话"] as const;

export const DEFAULT_PROFILE = {
  occupation: null,
  industry: null,
  markets: [] as string[],
  channels: [] as string[],
  dailyMinutes: 30,
  englishLevel: {},
  locale: "zh-CN",
  timezone: "Asia/Shanghai",
};
