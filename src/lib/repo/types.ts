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

// ---------------------------------------------------------------------------
// 模拟电话（Call Coach）
// ---------------------------------------------------------------------------

/** 通话目的枚举 */
export type CallPurpose =
  | "follow_up_inquiry"
  | "negotiation"
  | "collection"
  | "complaint"
  | "relationship"
  | "other";

export const CALL_PURPOSES: { value: CallPurpose; label: string }[] = [
  { value: "follow_up_inquiry", label: "跟进询盘" },
  { value: "negotiation", label: "议价压价" },
  { value: "collection", label: "催款" },
  { value: "complaint", label: "投诉处理" },
  { value: "relationship", label: "维护关系" },
  { value: "other", label: "其他" },
];

/** 客户档案（7 字段） */
export interface Customer {
  id: string;
  userId: string;
  name: string; // 客户名/公司
  countryMarket: string; // 国家市场
  role: string; // 职位
  mainProduct: string; // 主营产品
  history: string; // 跟我们历史（询盘/试样/下单/投诉）
  painPoints: string; // 已知痛点
  notes: string; // 备注
  createdAt: string;
  updatedAt: string;
}

/** 我们这边信息（通话简报） */
export interface OurSideInfo {
  product: string; // 产品/报价立场
  pricePosition: string; // 报价立场
  relationStage: string; // 关系阶段
  pastInteractions: string; // 过往互动
}

/** 通话一轮对话 */
export interface CallTurn {
  role: "user" | "ai_customer";
  content: string;
  createdAt: string;
}

/** 通话脚本骨架（生成一次，通话前/中参考） */
export interface CallScript {
  openingSuggestion: string; // 建议开场白
  likelyObjections: string[]; // 客户可能异议
  advancePoints: string[]; // 推进成交要点
  closingSuggestion: string; // 建议收尾
}

/** 一通电话会话 */
export interface CallSession {
  id: string;
  userId: string;
  customerId: string | null;
  customerSnapshot: Customer | null;
  purpose: CallPurpose;
  purposeOther: string | null;
  ourSide: OurSideInfo;
  scriptSkeleton: CallScript | null;
  status: "active" | "completed";
  turns: CallTurn[];
  transcript: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** 通话复盘四维度之一 */
export interface CallReviewDimension {
  key: "opening" | "objection" | "advance" | "closing";
  label: string;
  score: number; // 0-10
  comment: string;
  betterResponse: string;
}

/** 通话复盘输出 */
export interface CallReviewResult {
  overallScore: number; // 0-10
  dimensions: CallReviewDimension[]; // 固定 4 个维度
  highlights: string[];
  improvements: string[];
}
