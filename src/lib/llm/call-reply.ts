import { chat } from "./provider";
import { recordRun, estimateCost, evaluateAlertsAfterRun } from "./accounting";
import { langOf, conversationLangNote } from "./lang";
import { CALL_PURPOSES, type CallPurpose, type CallTurn, type Customer, type OurSideInfo } from "../repo/types";

/**
 * 模拟电话——AI 客户扮演（Call Responder）。
 * 自由多轮对话，不走 function calling，直接 chat + 手动记账（复用 roleplay-reply 模式）。
 * 把客户档案 + 通话目的 + 我们信息注入系统提示词，AI 在电话里扮演该客户。
 */

export interface CallReplyInput {
  customer: Customer | null;
  purpose: CallPurpose;
  purposeOther?: string | null;
  ourSide: OurSideInfo;
  turns: CallTurn[]; // 完整历史
  latestUserMessage: string;
  userId?: string | null;
  sessionId?: string | null;
  locale?: string | null;
}

const PURPOSE_LABEL = (p: CallPurpose, other?: string | null) =>
  p === "other" && other ? other : CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;

export async function callCustomerReply(input: CallReplyInput): Promise<{
  ok: boolean;
  reply?: string;
  error?: string;
}> {
  const { customer, purpose, purposeOther, ourSide, turns, latestUserMessage, userId, sessionId, locale } = input;
  const lang = langOf(locale);

  const history: { role: "user" | "assistant"; content: string }[] = turns.map((t) =>
    t.role === "user"
      ? { role: "user", content: t.content }
      : { role: "assistant", content: t.content },
  );

  const customerLine = customer
    ? `客户档案：\n` +
      `- 姓名/公司：${customer.name}\n` +
      `- 国家市场：${customer.countryMarket || "未知"}\n` +
      `- 职位：${customer.role || "未知"}\n` +
      `- 主营产品：${customer.mainProduct || "未知"}\n` +
      `- 跟我们历史：${customer.history || "暂无"}\n` +
      `- 已知痛点：${customer.painPoints || "暂无"}\n`
    : "客户档案：未提供（按通用海外买家对待）。\n";

  const purposeLabel = PURPOSE_LABEL(purpose, purposeOther);

  try {
    const resp = await chat({
      tier: "flash",
      temperature: 0.8,
      maxTokens: 512,
      messages: [
        {
          role: "system",
          content:
            (lang === "en"
              ? "You are the AI customer in Global Sales Coach, roleplaying a real overseas buyer on a phone call with the salesperson. " +
                "The conversation is entirely in English (you may use trade terms like FOB / MOQ / L/C).\n"
              : "你是 Global Sales Coach 中扮演买家的 AI 客户，正在和销售通一通电话（中文，可夹带英文商务词汇）。\n") +
            customerLine +
            `\n这通电话的目的：${purposeLabel}\n` +
            `我们这边信息（销售视角，你作为客户不知道细节，但可以感知）：\n` +
            `- 产品/报价立场：${ourSide.product || "未知"}\n` +
            `- 报价立场：${ourSide.pricePosition || "未知"}\n` +
            `- 关系阶段：${ourSide.relationStage || "未知"}\n` +
            `- 过往互动：${ourSide.pastInteractions || "暂无"}\n\n` +
            (lang === "en"
              ? "Your style: act like a real buyer on the phone — natural, not verbose (1-3 sentences), never speak for the salesperson, never judge their performance, never end the call yourself. " +
                "If the salesperson does well, ease up; if poorly (over-promising, pushing too hard, quoting before understanding needs), apply pressure naturally. " +
                "Stay in character for the whole call — you are the customer, not a coach.\n"
              : "你的风格：像真实买家在电话里一样自然，不要长篇大论（1-3 句话），不要替销售说话，不要评价销售表现，不要主动挂电话。" +
                "销售表现好时可以稍微缓和，表现差（如乱承诺、催单太急、没问需求就报价）时顺势施加压力。" +
                "整通都保持客户身份——你是买家，不是教练。\n") +
            conversationLangNote(lang),
        },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: latestUserMessage },
      ],
    });

    const reply = resp.content?.trim();
    if (!reply) return { ok: false, error: "AI 客户没有回复内容" };

    await recordRun({
      userId,
      taskType: "generate_call",
      model: resp.model,
      tier: "flash",
      provider: "volc-ark",
      status: "ok",
      retryCount: 0,
      inputTokens: resp.usage.inputTokens,
      outputTokens: resp.usage.outputTokens,
      reasoningTokens: resp.usage.reasoningTokens,
      sessionId,
      latencyMs: resp.latencyMs,
    }).catch(() => {});
    void evaluateAlertsAfterRun({
      userId,
      sessionId,
      costYuan: estimateCost("flash", resp.usage.inputTokens, resp.usage.outputTokens, resp.usage.reasoningTokens),
    });

    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI 客户回复失败" };
  }
}
