"use server";

import { redirect } from "next/navigation";
import { saveProfile, getProfile } from "@/lib/repo/profile";
import { addGoal } from "@/lib/repo/goal";
import type { Profile } from "@/lib/repo/types";
import { suggestGoals, type GoalSuggestion } from "@/lib/llm/goal-suggest";
import { runAssessment, type AssessmentDimension } from "@/lib/llm/assessment";
import { saveBaseline } from "@/lib/repo/assessment";

/**
 * Onboarding server actions。
 * 单用户：userId 固定 LOCAL_USER_ID（storage 内部解析）。
 */

export interface OnboardingInput {
  profile: Omit<Profile, "userId" | "updatedAt">;
  goals: { title: string; targetDate?: string | null }[];
}

/** 保存画像 + 目标，完成 Onboarding → 回首页 */
export async function completeOnboarding(input: OnboardingInput) {
  const profile = await saveProfile(input.profile);
  for (const g of input.goals) {
    if (g.title.trim()) await addGoal({ title: g.title.trim(), targetDate: g.targetDate });
  }
  redirect("/");
}

/** 用 LLM 生成目标建议（画像不必入库，直接透传） */
export async function suggestGoalsAction(profile: Omit<Profile, "userId" | "updatedAt">): Promise<{
  ok: boolean;
  goals?: GoalSuggestion[];
  degraded?: boolean;
  error?: string;
}> {
  try {
    return await suggestGoals({
      profile: { userId: "local", ...profile, updatedAt: new Date().toISOString() },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "生成失败" };
  }
}

/** 供首页/其他页查询当前画像 */
export async function getCurrentProfile(): Promise<Profile | null> {
  return getProfile();
}

/** 合并提交：保存画像 + 目标 + 跑基线评估并落库 → 回首页 */
export async function submitOnboarding(input: {
  profile: Omit<Profile, "userId" | "updatedAt">;
  goals: { title: string; targetDate?: string | null }[];
  selfRatings: Record<AssessmentDimension, number>;
  context?: string;
}) {
  const profile = await saveProfile(input.profile);
  for (const g of input.goals) {
    if (g.title.trim()) await addGoal({ title: g.title.trim(), targetDate: g.targetDate });
  }
  // 基线评估（失败不阻断：降级为自评基线，保证流程可完成）
  const assessment = await runAssessment({
    profile,
    selfRatings: input.selfRatings,
    context: input.context?.trim() || undefined,
  });
  if (assessment.ok && assessment.data) {
    await saveBaseline({
      dimensionScores: assessment.data.dimensionScores,
      overallSummary: assessment.data.overallSummary,
      selfRatings: input.selfRatings,
    });
  }
  redirect("/");
}

/** 独立重测（首页「重新测评」入口） */
export async function submitAssessment(input: {
  selfRatings: Record<AssessmentDimension, number>;
  context?: string;
}) {
  const profile = await getProfile();
  const assessment = await runAssessment({
    profile,
    selfRatings: input.selfRatings,
    context: input.context?.trim() || undefined,
  });
  if (assessment.ok && assessment.data) {
    await saveBaseline({
      dimensionScores: assessment.data.dimensionScores,
      overallSummary: assessment.data.overallSummary,
      selfRatings: input.selfRatings,
    });
  }
  redirect("/");
}
