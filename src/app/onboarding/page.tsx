import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/repo/profile";
import { OnboardingWizard } from "./wizard";

/**
 * Onboarding 引导页（登录后访问；proxy.ts 已挡未登录）。
 * 已完成引导 → 直接回首页；否则渲染多步引导。
 */
export default async function OnboardingPage() {
  const onboarded = await isOnboarded();
  if (onboarded) redirect("/");

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="mx-auto flex h-16 w-full max-w-lg items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
          G
        </span>
        <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          开始你的训练计划
        </span>
      </header>
      <OnboardingWizard />
    </main>
  );
}
