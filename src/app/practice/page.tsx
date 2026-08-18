import { listActiveSessions } from "@/lib/repo/attempt";
import { listGoals } from "@/lib/repo/goal";
import { getScenario } from "@/lib/repo/scenario";
import { listSkillStates } from "@/lib/repo/skill-state";
import { skillById, DIMENSION_LABEL } from "@/lib/repo/skills";
import { CreatePracticeButton } from "./create-practice-button";

/**
 * 演练入口页：新建演练（基于学习目标生成场景）+ 进行中的演练 + 技能概览。
 * ?focus=<skillId> 时进入「专项演练」模式，针对某一技能生成场景。
 */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const goals = await listGoals();
  const active = await listActiveSessions();
  const states = await listSkillStates();

  const rawFocus = (await searchParams).focus;
  const focusId = Array.isArray(rawFocus) ? rawFocus[0] : rawFocus;
  const focusDef = focusId ? skillById(focusId) : undefined;

  const activeWithScenario = await Promise.all(
    active.map(async (s) => ({ session: s, scenario: await getScenario(s.scenarioId) })),
  );

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
              G
            </span>
            <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              情景演练
            </span>
          </div>
          <a
            href="/"
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            首页
          </a>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {/* 专项演练（?focus=） */}
        {focusDef && (
          <div className="rounded-2xl border border-teal-300 bg-teal-50/70 p-5 dark:border-teal-800 dark:bg-teal-950/30">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white">
                专项演练
              </span>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                {focusDef.name}
              </h2>
            </div>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              {focusDef.description}
            </p>
            <p className="mt-1 text-xs text-teal-700 dark:text-teal-400">
              AI 客户会重点围绕这一技能施压，集中突破薄弱点。
            </p>
            <div className="mt-4">
              <CreatePracticeButton
                focusSkillId={focusDef.id}
                label={`🎯 针对「${focusDef.name}」生成专项演练`}
              />
            </div>
            <a
              href="/practice"
              className="mt-3 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              返回常规演练 →
            </a>
          </div>
        )}

        {/* 新建演练 */}
        <div
          className={
            "rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900" +
            (focusDef ? " mt-4" : "")
          }
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">开始一场新演练</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {goals[0]
              ? `围绕目标「${goals[0].title}」生成场景`
              : "先完成引导设定学习目标"}
          </p>
          <div className="mt-4">
            <CreatePracticeButton disabled={!goals[0]} />
          </div>
        </div>

        {/* 进行中的演练 */}
        {activeWithScenario.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">进行中的演练</h2>
            <ul className="mt-3 space-y-2.5">
              {activeWithScenario.map(({ session, scenario }) => (
                <li key={session.id}>
                  <a
                    href={`/practice/${session.id}`}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 transition hover:border-teal-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {scenario?.title ?? "演练"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {session.turns.length} 轮对话
                      </div>
                    </div>
                    <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
                      继续 →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 技能概览 */}
        {states.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">技能掌握度</h2>
            <div className="mt-3 space-y-2.5">
              {states.slice(0, 6).map((s) => {
                const def = skillById(s.skillId);
                return (
                  <div
                    key={s.skillId}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {def?.name ?? s.skillId}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {def ? DIMENSION_LABEL[def.dimension] : ""}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-all"
                        style={{ width: `${Math.round(s.mastery * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
