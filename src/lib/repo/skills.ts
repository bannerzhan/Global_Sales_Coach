/**
 * 技能字典（13 维，PRD Mastery Skill Graph 的底层粒度）。
 * 代码常量与 db/init/03-seed.sql 保持一致 —— 本地模式直接用常量，
 * DB 模式由 seed 脚本灌表。改这里记得同步 seed。
 */

export interface SkillDef {
  id: string;
  name: string;
  dimension: "communication" | "deal_advancement" | "trust_building";
  description: string;
}

export const SKILLS: SkillDef[] = [
  // ---- communication ----
  { id: "communication.openers", name: "开场白", dimension: "communication", description: "建立开场与明确沟通意图，快速进入主题" },
  { id: "communication.questioning", name: "需求挖掘", dimension: "communication", description: "用开放式/SPIN 式提问探明客户真实需求" },
  { id: "communication.value_prop", name: "价值陈述", dimension: "communication", description: "把产品特性翻译成客户收益，讲清差异化价值" },
  { id: "communication.active_listening", name: "积极倾听", dimension: "communication", description: "确认理解、复述客户观点，避免自说自话" },
  // ---- deal_advancement ----
  { id: "deal_advancement.price_objection", name: "价格异议", dimension: "deal_advancement", description: "处理价格太高/比同行贵等异议，锚定价值而非降价" },
  { id: "deal_advancement.moq_objection", name: "MOQ 异议", dimension: "deal_advancement", description: "处理起订量要求与客户需求不匹配的异议" },
  { id: "deal_advancement.urgency", name: "紧迫感营造", dimension: "deal_advancement", description: "通过稀缺/时效/机会成本推动决策" },
  { id: "deal_advancement.closing", name: "收单", dimension: "deal_advancement", description: "识别购买信号，用试探性收单/二选一推进成交" },
  { id: "deal_advancement.followup", name: "跟进", dimension: "deal_advancement", description: "保持联系节奏，用新增价值而非催促推进" },
  // ---- trust_building ----
  { id: "trust_building.rapport", name: "亲和信任", dimension: "trust_building", description: "语气亲和、共情客户处境，建立可信赖形象" },
  { id: "trust_building.proof", name: "证据背书", dimension: "trust_building", description: "用案例、数据、认证等第三方证据支撑主张" },
  { id: "trust_building.negotiation", name: "谈判", dimension: "trust_building", description: "在让步与坚持间找到双赢，避免单方面妥协" },
  { id: "trust_building.commitment", name: "承诺管理", dimension: "trust_building", description: "明确下一步与双方责任，避免模糊承诺" },
];

export const DIMENSION_LABEL: Record<SkillDef["dimension"], string> = {
  communication: "沟通表达",
  deal_advancement: "推进成交",
  trust_building: "信任建立",
};

export function skillById(id: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === id);
}

/** 技能掌握状态（skill_states 表映射） */
export interface SkillState {
  userId: string;
  skillId: string;
  mastery: number; // 0-1
  reps: number;
  lapses: number;
  nextReview: string | null; // ISO date
  lastReview: string | null;
}
