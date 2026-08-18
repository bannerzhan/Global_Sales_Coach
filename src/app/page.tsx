import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile, isOnboarded } from "@/lib/repo/profile";
import { listGoals } from "@/lib/repo/goal";
import { SignOutButton } from "./sign-out-button";

/**
 * 首页（登录后可见，proxy.ts 已拦截未登录请求）。
 * 未完成 Onboarding → 跳引导页；已完成 → 展示画像摘要 + 学习目标。
 */
export default async function HomePage() {
  const session = await auth();
  const email = session?.user?.email ?? "coach";

  const onboarded = await isOnboarded();
  if (!onboarded) redirect("/onboarding");

  const profile = await getProfile();
  const goals = await listGoals();

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
              G
            </span>
            <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Global Sales Coach
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          你好，{email}
        </h1>
        {profile?.occupation && (
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {profile.occupation}
            {profile.industry ? ` · ${profile.industry}` : ""}
            {profile.markets.length > 0 ? ` · 目标市场 ${profile.markets.join("/")}` : ""}
          </p>
        )}

        <div className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            学习目标
          </h2>
          {goals.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              还没有目标，下一步会引导你设定。
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {goals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {g.title}
                  </span>
                  {g.targetDate && (
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      目标 {g.targetDate}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: "情景演练", desc: "Step 6 上线", icon: "🎭" },
            { title: "技能复盘", desc: "Step 6 上线", icon: "📈" },
            { title: "每日一练", desc: `每天 ${profile?.dailyMinutes ?? 30} 分钟`, icon: "⏱️" },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-2xl">{c.icon}</div>
              <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">
                {c.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
