"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile } from "@/lib/repo/profile";
import { listGoals } from "@/lib/repo/goal";
import { createScenario, getScenario } from "@/lib/repo/scenario";
import {
  appendTurn,
  completeSession,
  createRoleplaySession,
  getRoleplaySession,
  createAttempt,
} from "@/lib/repo/attempt";
import { applySkillUpdates } from "@/lib/repo/skill-state";
import { skillById } from "@/lib/repo/skills";
import { generateScenario } from "@/lib/llm/scenario-gen";
import { customerReply } from "@/lib/llm/roleplay-reply";
import { reviewSession } from "@/lib/llm/review";
import type { ReviewOutput } from "@/lib/llm/review";
import type { RoleplayTurn } from "@/lib/repo/types";

/**
 * 演练闭环 server actions。
 * 多用户：userId 取自当前 session（proxy 已拦未登录）。
 */

/** 基于当前第一个 active 目标（或指定聚焦技能）生成场景并开一场演练 */
export async function createPractice(focusSkillId?: string | null) {
  const uid = (await auth())?.user?.id;
  const goals = await listGoals(uid);
  const profile = await getProfile(uid);

  // 专项演练：目标标题回退为该技能名
  const focusDef = focusSkillId ? skillById(focusSkillId) : undefined;
  const goalTitle =
    goals[0]?.title ?? focusDef?.name ?? "提升外贸销售沟通与成交能力";

  const gen = await generateScenario({
    goalTitle,
    userId: uid,
    profile:
      profile ??
      ({
        userId: uid ?? "local",
        occupation: "外贸业务员",
        industry: null,
        markets: [],
        channels: [],
        dailyMinutes: 30,
        englishLevel: {},
        locale: "en",
        timezone: "Asia/Shanghai",
        updatedAt: new Date().toISOString(),
      } as NonNullable<typeof profile>),
    focusSkillId,
    locale: profile?.locale ?? "en",
  });

  if (!gen.ok || !gen.data) {
    throw new Error("场景生成失败，请稍后重试");
  }

  const scenario = await createScenario({
    title: gen.data.title,
    category: gen.data.category,
    difficulty: gen.data.difficulty,
    persona: gen.data.persona,
    objectives: gen.data.objectives,
    pressureSequence: gen.data.pressureSequence,
    workContextSeed: null,
    openingLine: gen.data.openingLine,
    locale: profile?.locale ?? "en",
  });

  const openingTurn: RoleplayTurn = {
    role: "ai_customer",
    content: scenario.openingLine,
    pressureStep: 0,
    createdAt: new Date().toISOString(),
  };
  const session = await createRoleplaySession(scenario.id, openingTurn, uid);
  redirect(`/practice/${session.id}`);
}

/** 用户发言 → AI 客户回复（一进一出） */
export async function sendMessage(
  sessionId: string,
  content: string,
): Promise<{ ok: boolean; userTurn?: RoleplayTurn; aiTurn?: RoleplayTurn; error?: string }> {
  const text = content.trim();
  if (!text) return { ok: false, error: "消息不能为空" };

  const uid = (await auth())?.user?.id;
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) return { ok: false, error: "演练不存在" };
  if (session.status !== "active") return { ok: false, error: "演练已结束" };

  const scenario = await getScenario(session.scenarioId);
  if (!scenario) return { ok: false, error: "场景不存在" };

  // 1. 落用户发言
  const userTurn: RoleplayTurn = {
    role: "user",
    content: text,
    pressureStep: 0,
    createdAt: new Date().toISOString(),
  };
  await appendTurn(sessionId, userTurn, uid);

  // 2. AI 客户回复
  const updated = (await getRoleplaySession(sessionId, uid))!;
  const reply = await customerReply({
    scenario,
    turns: updated.turns,
    latestUserMessage: text,
    sessionId,
    userId: uid,
    locale: scenario.locale,
  });

  if (!reply.ok || !reply.reply) {
    return { ok: false, error: reply.error ?? "AI 客户回复失败，请重试" };
  }

  const aiTurn: RoleplayTurn = {
    role: "ai_customer",
    content: reply.reply,
    pressureStep: reply.pressureStep,
    createdAt: new Date().toISOString(),
  };
  await appendTurn(sessionId, aiTurn, uid);

  return { ok: true, userTurn, aiTurn };
}

/** 结束演练并复盘：评分 + 技能状态更新，跳转复盘页 */
export async function finishPractice(sessionId: string) {
  const uid = (await auth())?.user?.id;
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) throw new Error("演练不存在");

  const completed = (await completeSession(sessionId, uid)) ?? session;
  const scenario = await getScenario(session.scenarioId);

  // 复盘（失败不阻断：页面提供重试按钮）
  const review = await reviewSession({
    scenarioTitle: scenario?.title ?? "演练",
    persona: scenario?.persona ?? { role: "客户", nationality: "未知", temperament: "未知" },
    objectives: scenario?.objectives ?? [],
    turns: completed.turns,
    sessionId,
    userId: uid,
    locale: scenario?.locale,
  });

  if (review.ok && review.data && !review.degraded) {
    const data: ReviewOutput = review.data;
    // 落 attempts 记录（task_type=roleplay_turn，evaluation=复盘结果）
    const lastUserTurn = [...completed.turns].reverse().find((t) => t.role === "user");
    await createAttempt(
      {
        scenarioId: session.scenarioId,
        taskType: "roleplay_turn",
        userInput: lastUserTurn?.content ?? "",
        evaluation: { review: data, degraded: review.degraded ?? false },
        score: data.score,
        isRetry: false,
        attemptNo: 1,
      },
      uid,
    );
    // 更新技能状态
    await applySkillUpdates(data.skillUpdates, uid);
  }

  redirect(`/practice/${sessionId}/review`);
}

/** 复盘页重试复盘（首次失败时用） */
export async function retryReview(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const uid = (await auth())?.user?.id;
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) return { ok: false, error: "演练不存在" };
  const scenario = await getScenario(session.scenarioId);
  const review = await reviewSession({
    scenarioTitle: scenario?.title ?? "演练",
    persona: scenario?.persona ?? { role: "客户", nationality: "未知", temperament: "未知" },
    objectives: scenario?.objectives ?? [],
    turns: session.turns,
    sessionId,
    userId: uid,
    locale: scenario?.locale,
  });
  if (!review.ok || !review.data) return { ok: false, error: "复盘失败，请重试" };
  // LLM 调用失败走了兜底（customerSentenceAnalysis 为空数组）：不要落库误导用户，
  // 直接提示稍后再试，避免页面误判为「未生成逐句分析」。
  if (review.degraded) return { ok: false, error: "AI 暂时繁忙，复盘未生成，请稍后再试" };

  await createAttempt(
    {
      scenarioId: session.scenarioId,
      taskType: "roleplay_turn",
      userInput: "",
      evaluation: { review: review.data, degraded: review.degraded ?? false },
      score: review.data.score,
      isRetry: false,
      attemptNo: 1,
    },
    uid,
  );
  await applySkillUpdates(review.data.skillUpdates, uid);
  return { ok: true };
}

/** 复盘页读取最近一次复盘结果 */
export async function getLatestReview(sessionId: string): Promise<ReviewOutput | null> {
  const uid = (await auth())?.user?.id;
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) return null;
  const attempts = await listAttemptsForScenario(session.scenarioId, uid);
  const withReview = attempts.find(
    (a) => a.evaluation && (a.evaluation as { review?: unknown }).review,
  );
  return withReview ? ((withReview.evaluation as { review: ReviewOutput }).review ?? null) : null;
}

async function listAttemptsForScenario(scenarioId: string, userId?: string) {
  // 延迟 require 避免循环依赖（actions 只在这一处用）
  const { listAttempts } = await import("@/lib/repo/attempt");
  const all = await listAttempts(userId);
  return all.filter((a) => a.scenarioId === scenarioId);
}
