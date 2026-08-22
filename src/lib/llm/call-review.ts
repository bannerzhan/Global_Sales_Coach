import { z } from "zod";
import { runContract } from "./contract";
import { langOf, outputLangLine } from "./lang";
import { CALL_PURPOSES, type CallPurpose, type CallTurn, type Customer, type OurSideInfo } from "../repo/types";
import { REVIEW_MAX_TURNS } from "./review-config";

/**
 * 模拟电话复盘（Call Review）。
 * 对整通电话做四维度结构化点评：开场破冰 / 异议处理 / 成交推进 / 收尾确认，
 * 每维度评分 + 点评 + 更优话术。复用 review 引擎的 contract + 记账 + 降级逻辑。
 */

export const CALL_DIMENSIONS = [
  { key: "opening", label: "开场破冰" },
  { key: "objection", label: "异议处理" },
  { key: "advance", label: "成交推进" },
  { key: "closing", label: "收尾确认" },
] as const;

export const CallReviewSchema = z.object({
  overallScore: z.number().min(0).max(10, "总分 0-10"),
  dimensions: z
    .array(
      z.object({
        key: z.enum(["opening", "objection", "advance", "closing"]),
        label: z.string(),
        score: z.number().min(0).max(10),
        comment: z.string().min(2, "维度点评至少 2 字"),
        betterResponse: z.string().min(2, "给出更优话术示例"),
      }),
    )
    .length(4, "必须评 4 个固定维度")
    .describe("四个固定维度按顺序：开场破冰/异议处理/成交推进/收尾确认"),
  highlights: z.array(z.string()).min(1, "至少 1 个亮点").max(3),
  improvements: z.array(z.string()).min(1, "至少 1 条改进").max(4),
});
export type CallReviewOutput = z.infer<typeof CallReviewSchema>;

const PURPOSE_LABEL = (p: CallPurpose, other?: string | null) =>
  p === "other" && other ? other : CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;

export interface CallReviewInput {
  customer: Customer | null;
  purpose: CallPurpose;
  purposeOther?: string | null;
  ourSide: OurSideInfo;
  turns: CallTurn[];
  userId?: string | null;
  callId?: string | null;
  locale?: string | null;
}

export async function reviewCall(input: CallReviewInput): Promise<{
  ok: boolean;
  data?: CallReviewOutput;
  degraded?: boolean;
}> {
  const { customer, purpose, purposeOther, ourSide, turns, userId, callId, locale } = input;
  const lang = langOf(locale);
  const purposeLabel = PURPOSE_LABEL(purpose, purposeOther);

  const turnsForReview =
    turns.length > REVIEW_MAX_TURNS ? turns.slice(-REVIEW_MAX_TURNS) : turns;
  const dialogue = turnsForReview
    .map(
      (t, i) =>
        `${t.role === "user" ? (lang === "en" ? "[Sales]" : "【销售】") : lang === "en" ? "[Buyer]" : "【客户】"}(${i}): ${t.content}`,
    )
    .join("\n");

  const customerLine = customer
    ? `客户：${customer.name}（${customer.countryMarket || "未知"}${customer.role ? "，" + customer.role : ""}）\n` +
      `已知痛点：${customer.painPoints || "暂无"}\n`
    : "客户：未提供档案\n";

  const result = await runContract<CallReviewOutput>(
    {
      taskType: "evaluate_call",
      tier: "flash",
      toolName: "emit_call_review",
      toolDescription: "对一通销售电话做四维度结构化复盘",
      schema: CallReviewSchema,
      maxRetries: 1,
      maxTokens: 4096,
      userId,
      sessionId: callId,
      fallback: () => ({
        overallScore: 5,
        dimensions: CALL_DIMENSIONS.map((d) => ({
          key: d.key,
          label: d.label,
          score: 5,
          comment: lang === "en" ? "Limited coverage; keep practicing." : "本通覆盖有限，建议继续练习",
          betterResponse: lang === "en" ? "Try a clearer phrasing." : "尝试更清晰的表达",
        })),
        highlights: [lang === "en" ? "Completed the call" : "完成了通话"],
        improvements: [
          lang === "en" ? "Dig deeper into customer needs" : "进一步挖掘客户需求",
          lang === "en" ? "Confirm next step at the end" : "结尾确认下一步",
        ],
      }),
      system:
        "你是 Global Sales Coach 的电话教练，对刚结束的一通外贸客户电话做四维度复盘。\n" +
        "【行为准则（固定，不可改）】\n" +
        "1. 只用下方对话与已知信息，绝不虚构事实。\n" +
        "2. 语言反馈与商业建议严格区分：可纠正表达；绝不编造 Incoterms/支付/税务规则，涉及外部规则只在 improvements 里标注「建议核实」。\n" +
        "【四维度（必须各评，顺序固定）】\n" +
        "- opening（开场破冰）：第一句话是否自然、是否快速建立语境、有没有浪费客户时间\n" +
        "- objection（异议处理）：客户提出异议/顾虑时，销售是否接住了、有没有被带节奏\n" +
        "- advance（成交推进）：有没有主动推进目的（跟进/议价/催款/投诉解决/关系）、有没有明确下一步\n" +
        "- closing（收尾确认）：结尾是否确认了共识与下一步、有没有留下尾巴\n" +
        "每个维度给 score(0-10)、comment(具体点评)、betterResponse(一句更优话术可直接套用)。\n" +
        "3. overallScore 是 0-10 总分。\n" +
        "4. highlights 给 1-3 条具体亮点；improvements 给 1-4 条可执行改进。\n" +
        "5. " + outputLangLine(lang),
    },
    [
      {
        role: "user",
        content:
          `这通电话目的：${purposeLabel}\n` +
          customerLine +
          `我们信息：产品=${ourSide.product || "未知"}，报价立场=${ourSide.pricePosition || "未知"}，关系阶段=${ourSide.relationStage || "未知"}\n\n` +
          `完整对话：\n${dialogue}\n\n请给出四维度复盘。`,
      },
    ],
  );

  if (result.ok) return { ok: true, data: result.data };
  if (result.reason === "degraded" && result.data) return { ok: true, data: result.data, degraded: true };
  return { ok: false };
}
