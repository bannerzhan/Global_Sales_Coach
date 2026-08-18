"use server";

import { redirect } from "next/navigation";
import { saveProfile, getProfile } from "@/lib/repo/profile";
import { addGoal } from "@/lib/repo/goal";
import type { Profile } from "@/lib/repo/types";
import { suggestGoals, type GoalSuggestion } from "@/lib/llm/goal-suggest";

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
