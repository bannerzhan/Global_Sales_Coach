import { z } from "zod";
import { runContract } from "./contract";
import { langOf, outputLangLine } from "./lang";
import type { Profile } from "../repo/types";
import { DIMENSION_LABEL } from "../repo/skills";

/**
 * 基线评估（Onboarding 末尾跑一次，<5min）。
 * 只测 3 个销售结果导向聚合维度（13 维 Skill Graph 的底层 schema 只在这一层聚合）：
 *   communication（沟通表达）/ deal_advancement（推进成交）/ trust_building（信任建立）
 * 输出 0-10 分 + 每维度一句话点评 + 总评。严格走输出契约链，并注入反幻觉 POLICY。
 */

export const ASSESSMENT_DIMENSIONS = [
  "communication",
  "deal_advancement",
  "trust_building",
] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export const ASSESSMENT_DIM_LABEL: Record<AssessmentDimension, string> = {
  communication: DIMENSION_LABEL.communication,
  deal_advancement: DIMENSION_LABEL.deal_advancement,
  trust_building: DIMENSION_LABEL.trust_building,
};

const AssessmentSchema = z.object({
  dimensionScores: z
    .array(
      z.object({
        dimension: z.enum(ASSESSMENT_DIMENSIONS),
        score: z.number().min(0).max(10),
        summary: z.string().min(4, "维度点评至少 4 字"),
      }),
    )
    .length(3),
  overallSummary: z.string().min(8, "总评至少 8 字").max(200),
});

export type AssessmentOutput = z.infer<typeof AssessmentSchema>;

export interface AssessmentInput {
  profile?: Profile | null;
  selfRatings: Record<AssessmentDimension, number>; // 1-5 用户自评
  context?: string; // 选填：一段真实外贸沟通经历
  userId?: string | null;
  /** 演练语言："zh-CN" | "en" */
  locale?: string | null;
}

const POLICY = `【行为准则（固定，不可改）】
1. 只用下方 CONTEXT / 用户自评里提供的信息，绝不虚构用户的公司、行业、客户、订单、金额等事实。
2. 语言反馈与商业建议严格区分：可描述表达强弱，绝不编造 Incoterms / 支付条款 / 法律 / 税务 / 关税规则；如涉及外部规则只标注"建议核实"并给官方渠道，不替模型编数字。
3. 只输出符合 schema 的 JSON，不输出任何额外文字。`;

export async function runAssessment(input: AssessmentInput): Promise<{
  ok: boolean;
  data?: AssessmentOutput;
  degraded?: boolean;
}> {
  const lang = langOf(input.locale);
  const selfLines = ASSESSMENT_DIMENSIONS.map(
    (d) => `- ${ASSESSMENT_DIM_LABEL[d]}（${d}）自评：${input.selfRatings[d]}/5`,
  ).join("\n");
  const fb = (zh: string, en: string) => (lang === "en" ? en : zh);

  const profileLine = input.profile
    ? `用户画像：${input.profile.occupation ?? "未填"} · ${input.profile.industry ?? "未填行业"} · 目标市场 ${
        input.profile.markets?.join("/") || "未填"
      } · 英语自评 ${JSON.stringify(input.profile.englishLevel ?? {})}`
    : "用户画像：未提供";

  const userMessage =
    `${profileLine}\n\n` +
    `用户自评（1-5，1=入门 5=熟练）：\n${selfLines}\n\n` +
    (input.context
      ? `补充经历（用户自述，仅作能力信号，不得当作已知事实引用）：\n${input.context}\n\n`
      : "") +
    `请输出基线评估。`;

  const result = await runContract<AssessmentOutput>({
      taskType: "baseline_assessment",
      tier: "flash",
    toolName: "emit_assessment",
    toolDescription: "对外贸销售能力做基线评估，输出 3 个聚合维度评分",
    schema: AssessmentSchema,
    maxRetries: 1,
    maxTokens: 1024,
    userId: input.userId,
    fallback: () => ({
      // 降级：直接用用户自评（1-5 映射 0-10）作为基线，保证流程不中断
      dimensionScores: ASSESSMENT_DIMENSIONS.map((d) => ({
        dimension: d,
        score: Math.round((input.selfRatings[d] / 5) * 10),
        summary: fb("基于你的自评生成的初步基线", "Preliminary baseline derived from your self-rating"),
      })),
      overallSummary: fb(
        "已完成初步基线评估，建议多完成几场演练以校准能力画像。",
        "Preliminary baseline set. Complete more drills to calibrate your ability profile.",
      ),
    }),
    system:
      "你是 Global Sales Coach 的基线评估教练，为一位中国外贸销售做能力基线测评。\n" +
      POLICY +
      "\n" +
      "任务：根据【用户自评】和【用户画像】，对以下 3 个销售结果导向的聚合维度各打 0-10 分，并给一句话点评；最后给一段总评。\n" +
      "维度（必须全部给出）：\n" +
      ASSESSMENT_DIMENSIONS.map((d) => `- ${d}（${ASSESSMENT_DIM_LABEL[d]}）`).join("\n") +
      "\n" +
      "评分要基于真实能力信号（自评 + 画像 + 经历），不要无依据给高分。" + outputLangLine(lang),
  },
  [
    {
      role: "user",
      content: userMessage,
    },
  ],
);

  if (result.ok) return { ok: true, data: result.data };
  if (result.reason === "degraded" && result.data) {
    return { ok: true, data: result.data, degraded: true };
  }
  return { ok: false };
}
