import { z } from "zod";
import { runContract } from "./contract";
import { langOf, outputLangLine, conversationLangNote } from "./lang";
import { CALL_PURPOSES, type CallPurpose, type Customer, type OurSideInfo } from "../repo/types";

/**
 * 通话脚本骨架生成（Call Script Generator）。
 * 基于客户档案 + 通话目的 + 我们信息 → 生成贴近真实电话的四段式骨架：
 * 开场建议 / 客户可能异议 / 推进成交要点 / 收尾建议。
 * 走输出契约链，失败模板降级。
 */

export const CallScriptSchema = z.object({
  openingSuggestion: z.string().min(4, "开场建议至少 4 字"),
  likelyObjections: z.array(z.string()).min(1, "至少 1 条可能异议").max(5),
  advancePoints: z.array(z.string()).min(1, "至少 1 个推进要点").max(5),
  closingSuggestion: z.string().min(4, "收尾建议至少 4 字"),
});
export type CallScriptResult = z.infer<typeof CallScriptSchema>;

export interface CallScriptInput {
  customer: Customer;
  purpose: CallPurpose;
  purposeOther?: string | null;
  ourSide: OurSideInfo;
  userId?: string | null;
  locale?: string | null;
}

const PURPOSE_LABEL = (p: CallPurpose, other?: string | null) =>
  p === "other" && other ? other : CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;

export async function generateCallScript({
  customer,
  purpose,
  purposeOther,
  ourSide,
  userId,
  locale,
}: CallScriptInput): Promise<{ ok: boolean; data?: CallScriptResult; degraded?: boolean }> {
  const lang = langOf(locale);
  const purposeLabel = PURPOSE_LABEL(purpose, purposeOther);
  const result = await runContract<CallScriptResult>(
    {
      taskType: "generate_call_script",
      tier: "flash",
      toolName: "emit_call_script",
      toolDescription: "根据客户档案和通话目的生成电话脚本骨架",
      schema: CallScriptSchema,
      maxRetries: 1,
      maxTokens: 1024,
      userId,
      fallback: () => ({
        openingSuggestion:
          lang === "en"
            ? `Hi ${customer.name}, this is calling regarding ${ourSide.product}.`
            : `您好 ${customer.name}，我是关于${ourSide.product}的事打电话过来的。`,
        likelyObjections: [
          lang === "en" ? "Price is too high" : "觉得报价偏高",
          lang === "en" ? "Need to compare with other suppliers" : "想再对比几家供应商",
        ],
        advancePoints: [lang === "en" ? "Confirm delivery lead time" : "确认交期与最小起订量"],
        closingSuggestion: lang === "en" ? "Let me summarize and confirm next step." : "总结一下今天沟通，确认下一步。",
      }),
      system:
        "你是 Global Sales Coach 的电话教练，帮外贸业务员设计一通真实的客户电话脚本骨架。\n" +
        "要求：\n" +
        "1. openingSuggestion 是建议的开场白（自然、口语、像真打电话，1-2 句）\n" +
        "2. likelyObjections 是这通电话里客户最可能抛出的 1-5 条异议/顾虑（针对本次目的）\n" +
        "3. advancePoints 是销售可以主动推进成交/目的的 1-5 个要点\n" +
        "4. closingSuggestion 是建议的收尾（确认下一步/约后续）\n" +
        "5. 内容要贴合客户画像与我们信息，不要空话。" +
        outputLangLine(lang),
    },
    [
      {
        role: "user",
        content:
          `【客户档案】\n` +
          `姓名/公司：${customer.name}\n` +
          `国家市场：${customer.countryMarket || "未知"}\n` +
          `职位：${customer.role || "未知"}\n` +
          `主营产品：${customer.mainProduct || "未知"}\n` +
          `跟我们历史：${customer.history || "暂无"}\n` +
          `已知痛点：${customer.painPoints || "暂无"}\n` +
          `备注：${customer.notes || "暂无"}\n\n` +
          `【这通电话的目的】${purposeLabel}\n\n` +
          `【我们这边信息】\n` +
          `产品/报价立场：${ourSide.product || "未知"}\n` +
          `报价立场：${ourSide.pricePosition || "未知"}\n` +
          `关系阶段：${ourSide.relationStage || "未知"}\n` +
          `过往互动：${ourSide.pastInteractions || "暂无"}\n\n` +
          `请生成这通电话的脚本骨架（${conversationLangNote(lang)}）。`,
      },
    ],
  );

  if (result.ok) return { ok: true, data: result.data };
  if (result.reason === "degraded" && result.data) return { ok: true, data: result.data, degraded: true };
  return { ok: false };
}
