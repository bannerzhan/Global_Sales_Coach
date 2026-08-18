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

// ---------------------------------------------------------------------------
// 演练闭环（Step 6）
// ---------------------------------------------------------------------------

/** 买家画像（scenarios.persona） */
export interface Persona {
  role: string;
  nationality: string;
  temperament: string;
  companySize?: string;
  budget?: string;
}

/** 演练场景 */
export interface Scenario {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: number; // 1-5
  persona: Persona;
  objectives: string[]; // 对应 skill ids
  pressureSequence: string[]; // 压力递进
  workContextSeed: string | null;
  openingLine: string; // AI 客户开场白
  locale: string; // 演练语言："zh-CN" | "en"，创建场景时锁定，复盘/客户跟随
  createdAt: string;
}

/** 角色扮演会话 */
export interface RoleplaySession {
  id: string;
  userId: string;
  scenarioId: string;
  status: "active" | "completed" | "aborted";
  turns: RoleplayTurn[];
  startedAt: string;
  endedAt: string | null;
}

export interface RoleplayTurn {
  role: "user" | "ai_customer";
  content: string;
  pressureStep: number; // 当前压力递进到第几步（从 0 开始）
  createdAt: string;
}

/** 演练记录（attempts） */
export interface Attempt {
  id: string;
  userId: string;
  scenarioId: string | null;
  taskType: string;
  userInput: string;
  evaluation: Record<string, unknown> | null;
  score: number | null; // 0-10
  isRetry: boolean;
  attemptNo: number;
  createdAt: string;
}

/** 复盘输出（review 契约链结果） */
export interface ReviewResult {
  score: number; // 0-10
  dimensionScores: { dimension: string; score: number; comment: string }[];
  highlights: string[];
  improvements: string[];
  skillUpdates: { skillId: string; delta: number; note: string }[];
  turnFeedback: { turnIndex: number; comment: string }[];
}
