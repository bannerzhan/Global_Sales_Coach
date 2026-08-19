import { z } from "zod";
import { runContract } from "./contract";
import { langOf, outputLangLine } from "./lang";
import type { Profile } from "../repo/types";

/**
 * Goal Interview：根据画像生成 3 个具体可衡量的学习目标。
 * 走输出契约链（function calling → zod → 重试 → 模板降级），
 * 业务侧只定义 schema + 兜底，记账/重试全自动。
 */

export const GoalSuggestionSchema = z.object({
  goals: z
    .array(
      z.object({
        title: z.string().min(4).max(100, "目标标题 4-100 字"),
        targetDate: z.string().date("日期格式 YYYY-MM-DD").nullable().optional(),
        rationale: z.string().max(200, "理由不超过 200 字"),
      }),
    )
    .min(1, "至少 1 个目标")
    .max(3, "最多 3 个目标"),
});
export type GoalSuggestion = z.infer<typeof GoalSuggestionSchema>["goals"][number];

export interface SuggestGoalsInput {
  profile: Profile;
  userId?: string | null;
  /** 演练语言："zh-CN" | "en" */
  locale?: string | null;
}

/** 模板降级兜底：LLM 不可用时给一组通用目标 */
function fallbackGoals(lang: "zh" | "en" = "zh"): GoalSuggestion[] {
  const fb = (zh: string, en: string) => (lang === "en" ? en : zh);
  const today = new Date();
  const plusMonths = (m: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  return [
    {
      title: fb("完成一次完整的客户需求挖掘演练（SPIN 提问法）", "Complete a full customer-needs discovery drill (SPIN questioning)"),
      targetDate: plusMonths(1),
      rationale: fb("需求挖掘是销售流程第一环，优先夯实", "Needs discovery is the first step of selling; prioritize it"),
    },
    {
      title: fb("完成 3 轮价格异议处理角色扮演并复盘", "Run 3 price-objection roleplays and review each"),
      targetDate: plusMonths(2),
      rationale: fb("价格异议是外贸销售最高频场景", "Price objection is the most frequent scenario in export sales"),
    },
    {
      title: fb("建立 5 条个人销售话术模板并每周演练 1 次", "Build 5 personal sales script templates; drill one per week"),
      targetDate: plusMonths(3),
      rationale: fb("可复用资产，沉淀沟通风格", "Reusable assets that consolidate your communication style"),
    },
  ];
}

export async function suggestGoals({ profile, userId, locale }: SuggestGoalsInput): Promise<{
  ok: boolean;
  goals?: GoalSuggestion[];
  degraded?: boolean;
}> {
  const lang = langOf(locale);
  const profileDesc = [
    profile.occupation ? `职位: ${profile.occupation}` : null,
    profile.industry ? `行业: ${profile.industry}` : null,
    profile.markets.length ? `目标市场: ${profile.markets.join("/")}` : null,
    profile.channels.length ? `获客渠道: ${profile.channels.join("/")}` : null,
    profile.dailyMinutes ? `每日可投入: ${profile.dailyMinutes} 分钟` : null,
    profile.englishLevel.speaking
      ? `口语水平(1-5): ${profile.englishLevel.speaking}`
      : null,
    profile.englishLevel.listening
      ? `听力水平(1-5): ${profile.englishLevel.listening}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runContract<{ goals: GoalSuggestion[] }>(
    {
      taskType: "goal_suggest",
      tier: "pro",
      toolName: "emit_goals",
      toolDescription: "根据用户销售画像输出 3 个具体、可衡量、有截止日期的学习目标",
      schema: GoalSuggestionSchema,
      fallback: () => ({ goals: fallbackGoals(lang) }),
      maxRetries: 1,
      maxTokens: 1024,
      userId,
      system:
        "你是 Global Sales Coach 的销售培训教练。根据用户画像生成 3 个学习目标。\n" +
        "要求：\n" +
        "1. 目标必须具体可衡量（包含可验证的动作或数量），不要空泛（如'提高销售能力'）\n" +
        "2. 结合用户的职位、行业、目标市场、渠道和英语水平\n" +
        (lang === "en"
          ? "3. Output titles in English; targetDate in YYYY-MM-DD (estimate a reasonable completion date)\n"
          : "3. 用中文输出标题；targetDate 用 YYYY-MM-DD（合理估算完成时间）\n") +
        (lang === "en"
          ? "4. rationale in one sentence explaining why this goal is high priority"
          : "4. rationale 用一句话说明为什么这个目标优先级高"),
    },
    [
      {
        role: "user",
        content:
          `请为以下画像生成 3 个学习目标：\n${profileDesc || "（用户尚未填写完整画像，给出通用目标）"}`,
      },
    ],
  );

  if (result.ok) return { ok: true, goals: result.data.goals };
  if (result.reason === "degraded" && result.data) {
    return { ok: true, goals: result.data.goals, degraded: true };
  }
  return { ok: false, goals: fallbackGoals(lang), degraded: true };
}
