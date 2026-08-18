import { chat } from "./provider";
import { recordRun, estimateCost, evaluateAlertsAfterRun } from "./accounting";
import type { Persona, RoleplayTurn, Scenario } from "../repo/types";

/**
 * AI 客户扮演（Roleplay Responder）。
 * 自由多轮对话——不走 function calling 契约，直接 chat + 手动记账。
 * 压力递进：按用户发言轮数逐步推进 pressureSequence。
 */

export interface ReplyInput {
  scenario: Scenario;
  turns: RoleplayTurn[]; // 完整历史（含开场白）
  latestUserMessage: string;
  userId?: string | null;
  sessionId?: string | null;
}

const PRESSURE_EVERY_TURNS = 2; // 每 2 轮用户发言推进一次压力

export async function customerReply(input: ReplyInput): Promise<{
  ok: boolean;
  reply?: string;
  pressureStep: number;
  error?: string;
}> {
  const { scenario, turns, latestUserMessage, userId, sessionId } = input;

  // 计算压力步数：用户发言次数（含本次）
  const userTurns = turns.filter((t) => t.role === "user").length + 1;
  const pressureStep = Math.min(
    Math.max(0, scenario.pressureSequence.length - 1),
    Math.floor((userTurns - 1) / PRESSURE_EVERY_TURNS),
  );

  const history: { role: "user" | "assistant"; content: string }[] = turns.map((t) =>
    t.role === "user"
      ? { role: "user", content: t.content }
      : { role: "assistant", content: t.content },
  );

  const persona = scenario.persona;
  const pressureNote =
    pressureStep > 0
      ? `本轮你要推进到压力阶段 ${pressureStep + 1}/${scenario.pressureSequence.length}：` +
        `「${scenario.pressureSequence[pressureStep]}」——请在这个压力点上继续扮演。`
      : "开场阶段，先自然互动，把对话引向主题。";

  try {
    const resp = await chat({
      tier: "turbo",
      temperature: 0.8,
      maxTokens: 512,
      messages: [
        {
          role: "system",
          content:
            `你是 Global Sales Coach 中扮演买家的 AI 客户，正在和销售进行一场英文/中文外贸洽谈演练（对话用中文，可夹带英文商务词汇）。\n` +
            `买家画像：\n` +
            `- 角色：${persona.role}\n` +
            `- 国籍：${persona.nationality}\n` +
            `- 性格：${persona.temperament}\n` +
            (persona.companySize ? `- 公司规模：${persona.companySize}\n` : "") +
            (persona.budget ? `- 预算：${persona.budget}\n` : "") +
            `\n整体剧情：${scenario.title}\n` +
            `你的风格：像真实买家一样自然，不要长篇大论（1-3 句话），不要替销售说话，` +
            `不要评价销售的表现，不要主动结束对话。销售表现好时可以稍微缓和，` +
            `表现差（如乱承诺、催单太急、没问需求就报价）时顺势施加压力。\n` +
            `压力剧本：${scenario.pressureSequence.join(" → ")}\n\n` +
            pressureNote,
        },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: latestUserMessage },
      ],
    });

    const reply = resp.content?.trim();
    if (!reply) return { ok: false, pressureStep, error: "AI 客户没有回复内容" };

    // 记账（fail-open，DB 不可用跳过）
    await recordRun({
      userId,
      taskType: "generate_roleplay",
      model: resp.model,
      tier: "turbo",
      provider: "volc-ark",
      status: "ok",
      retryCount: 0,
      inputTokens: resp.usage.inputTokens,
      outputTokens: resp.usage.outputTokens,
      reasoningTokens: resp.usage.reasoningTokens,
      sessionId,
      latencyMs: resp.latencyMs,
    }).catch(() => {});
    // 跑后预算告警评估
    void evaluateAlertsAfterRun({
      userId,
      sessionId,
      costYuan: estimateCost(
        "turbo",
        resp.usage.inputTokens,
        resp.usage.outputTokens,
        resp.usage.reasoningTokens,
      ),
    });

    return { ok: true, reply, pressureStep };
  } catch (err) {
    return {
      ok: false,
      pressureStep,
      error: err instanceof Error ? err.message : "AI 客户回复失败",
    };
  }
}
