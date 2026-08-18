import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile, isOnboarded } from "@/lib/repo/profile";
import { listGoals } from "@/lib/repo/goal";
import { dueSkillStates, listSkillStates } from "@/lib/repo/skill-state";
import { skillById } from "@/lib/repo/skills";
import { getLatestBaseline } from "@/lib/repo/assessment";
import { ASSESSMENT_DIM_LABEL } from "@/lib/llm/assessment";
import { SignOutButton } from "./sign-out-button";
import { BudgetStatus } from "./budget-status";
import { LanguageToggle } from "@/components/LanguageToggle";

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
  const due = await dueSkillStates();
  const states = await listSkillStates();
  const baseline = await getLatestBaseline();

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
          <div className="flex items-center gap-2">
            <LanguageToggle locale={profile?.locale ?? "zh-CN"} />
            <SignOutButton />
          </div>
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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              能力基线
            </h2>
            <a href="/assessment" className="text-sm text-teal-600 hover:underline dark:text-teal-400">
              {baseline ? "重新测评" : "去测评"} →
            </a>
          </div>
          {baseline ? (
            <ul className="mt-3 space-y-2.5">
              {baseline.dimensionScores.map((s) => (
                <li
                  key={s.dimension}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {ASSESSMENT_DIM_LABEL[s.dimension as keyof typeof ASSESSMENT_DIM_LABEL] ?? s.dimension}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{s.score}/10</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${s.score * 10}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              还没有能力基线，<a href="/assessment" className="text-teal-600 hover:underline dark:text-teal-400">点这里花 1 分钟测一下</a>，定制你的训练起点。
            </p>
          )}
        </div>

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
          <a
            href="/practice"
            className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
          >
            <div className="text-2xl">🎭</div>
            <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">
              情景演练
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              AI 客户角色扮演，练完自动复盘
            </p>
          </a>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 opacity-60 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl">📈</div>
            <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">
              技能图谱
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              13 维掌握度，后续版本开放
            </p>
          </div>
          <a
            href="/practice"
            className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
          >
            <div className="text-2xl">⏱️</div>
            <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">
              每日一练
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              基于 FSRS 排期，自动推送该练的技能
            </p>
          </a>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              复习与掌握
            </h2>
            <a href="/practice" className="text-sm text-teal-600 hover:underline dark:text-teal-400">
              去演练 →
            </a>
          </div>

          {due.length > 0 && (
            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
              <p className="text-sm font-medium text-teal-800 dark:text-teal-300">
                待复习（{due.length}）
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {due.map((s) => (
                  <li key={s.skillId}>
                    <a
                      href={`/practice?focus=${s.skillId}`}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200 transition hover:ring-teal-400 hover:underline dark:bg-zinc-900 dark:text-teal-300 dark:ring-teal-900"
                    >
                      {skillById(s.skillId)?.name ?? s.skillId}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {states.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {states.slice(0, 8).map((s) => (
                <li
                  key={s.skillId}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {skillById(s.skillId)?.name ?? s.skillId}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      {Math.round(s.mastery * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.round(s.mastery * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              还没有练习记录，去「情景演练」完成第一场吧。
            </p>
          )}
        </div>
        <BudgetStatus />
      </section>
    </main>
  );
}
