import { z } from "zod";
import { runContract } from "./contract";
import type { ReviewResult, RoleplayTurn } from "../repo/types";
import { SKILLS } from "../repo/skills";

/**
 * 演练复盘（Review / Evaluate Attempt）。
 * 对整场角色扮演做结构化点评：总分 + 三维度分 + 亮点/改进 + 逐轮反馈 + 技能增量。
 * 输出直接驱动 skill_states 更新（applySkillUpdates）。
 */

const DIMENSIONS = ["communication", "deal_advancement", "trust_building"] as const;

export const ReviewSchema = z.object({
  score: z.number().min(0).max(10, "总分 0-10"),
  dimensionScores: z
    .array(
      z.object({
        dimension: z.enum(DIMENSIONS),
        score: z.number().min(0).max(10),
        comment: z.string().min(2, "维度点评至少 2 字"),
      }),
    )
    .min(3, "三个维度都要评")
    .max(3),
  highlights: z.array(z.string()).min(1, "至少 1 个亮点").max(3),
  improvements: z.array(z.string()).min(1, "至少 1 条改进建议").max(4),
  // 语言反馈与商业建议严格区分（§3.5）
  feedbackLanguage: z
    .array(z.string())
    .min(1, "至少 1 条表达/语言层面的改进")
    .max(4)
    .describe("表达、句式、用词、沟通技巧等语言层面改进建议"),
  feedbackBusiness: z
    .array(z.string())
    .max(4)
    .describe("涉及 Incoterms/支付/法律/税务等商业规则时的核实提示；无则留空数组"),
  skillUpdates: z
    .array(
      z.object({
        skillId: z.string(),
        delta: z.number().min(-0.3).max(0.3, "技能增量 -0.3 ~ +0.3"),
        note: z.string().min(1, "技能点评至少 1 字"),
      }),
    )
    .min(1, "至少 1 个技能更新")
    .max(4),
  turnFeedback: z
    .array(z.object({ turnIndex: z.number().int().min(0), comment: z.string() }))
    .max(8),
});
export type ReviewOutput = z.infer<typeof ReviewSchema>;

const DIM_LABEL: Record<(typeof DIMENSIONS)[number], string> = {
  communication: "沟通表达",
  deal_advancement: "推进成交",
  trust_building: "信任建立",
};

export interface ReviewInput {
  scenarioTitle: string;
  persona: { role: string; nationality: string; temperament: string };
  objectives: string[];
  turns: RoleplayTurn[];
  userId?: string | null;
  sessionId?: string | null;
}

export async function reviewSession(input: ReviewInput): Promise<{
  ok: boolean;
  data?: ReviewOutput;
  degraded?: boolean;
}> {
  const dialogue = input.turns
    .map((t, i) => `${t.role === "user" ? "【销售】" : "【客户】"}(${i}): ${t.content}`)
    .join("\n");

  const skillPool = SKILLS.map((s) => `${s.id}（${s.name}）`).join("、");

  const result = await runContract<ReviewOutput>(
    {
      taskType: "evaluate_attempt",
      tier: "pro", // 复盘需要深度推理，用 pro
      toolName: "emit_review",
      toolDescription: "对销售演练对话输出结构化复盘",
      schema: ReviewSchema,
      maxRetries: 1,
      maxTokens: 2048,
      userId: input.userId,
      sessionId: input.sessionId,
      fallback: () => ({
        score: 5,
        dimensionScores: DIMENSIONS.map((d) => ({
          dimension: d,
          score: 5,
          comment: "本次演练覆盖有限，建议继续练习",
        })),
        highlights: ["完成了演练"],
        improvements: ["需求挖掘不够深入", "建议多做一轮练习"],
        feedbackLanguage: ["注意用更具体的提问替代泛泛而谈", "可多用开放式问题探需求"],
        feedbackBusiness: [],
        skillUpdates: input.objectives.slice(0, 2).map((sid) => ({
          skillId: sid,
          delta: 0.05,
          note: "完成演练，小幅进步",
        })),
        turnFeedback: [],
      }),
      system:
        "你是 Global Sales Coach 的首席销售教练，对刚结束的一场角色扮演演练做复盘。\n" +
        "【行为准则（固定，不可改）】\n" +
        "1. 只用下方对话与已知信息，绝不虚构用户的公司、行业、客户、订单、金额等事实。\n" +
        "2. 语言反馈与商业建议严格区分：可纠正表达错误；绝不编造 Incoterms / 支付条款 / 法律 / 税务 / 关税规则。涉及外部商业规则时只在 feedbackBusiness 里标注「建议核实」并给官方渠道，不替模型编数字。\n" +
        "输出要求：\n" +
        "1. score 是 0-10 的总分，反映整体销售表现\n" +
        "2. dimensionScores 固定评 3 个维度：" +
        DIMENSIONS.map((d) => `${d}（${DIM_LABEL[d]}）`).join("、") + "\n" +
        "3. highlights 给 1-3 条具体亮点（引用对话里的原话更好）\n" +
        "4. improvements 给 1-4 条可执行改进（不是空话，要具体到动作）\n" +
        "5. feedbackLanguage：1-4 条表达/语言层面的改进（句式、用词、提问技巧等）\n" +
        "6. feedbackBusiness：涉及商业规则时的核实提示；没有则给空数组 []\n" +
        "7. skillUpdates 从以下技能池选 1-4 个，delta 表示掌握度增减（-0.3~+0.3）：\n" +
        `   ${skillPool}\n` +
        "8. turnFeedback 挑 0-8 个关键轮次给逐轮点评（turnIndex 对应对话序号）\n" +
        "9. 全部用中文输出",
    },
    [
      {
        role: "user",
        content:
          `场景：${input.scenarioTitle}\n` +
          `买家：${input.persona.role}（${input.persona.nationality}，${input.persona.temperament}）\n` +
          `练习目标技能：${input.objectives.join("、")}\n` +
          `完整对话：\n${dialogue}\n\n请给出复盘。`,
      },
    ],
  );

  if (result.ok) return { ok: true, data: result.data };
  if (result.reason === "degraded" && result.data) {
    return { ok: true, data: result.data, degraded: true };
  }
  return { ok: false };
}
