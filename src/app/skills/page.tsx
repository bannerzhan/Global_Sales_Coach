import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOnboarded } from "@/lib/repo/profile";
import { listSkillStates } from "@/lib/repo/skill-state";
import { SKILLS, DIMENSION_LABEL, type SkillDef } from "@/lib/repo/skills";
import type { SkillState } from "@/lib/repo/skills";
import { SignOutButton } from "../sign-out-button";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays <= 7) return `${diffDays} 天后`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function difficultyLabel(d: number): string {
  if (d <= 3) return "容易";
  if (d <= 6) return "适中";
  return "困难";
}

function dimensionAccent(dimension: SkillDef["dimension"]): string {
  switch (dimension) {
    case "communication":
      return "bg-blue-500";
    case "deal_advancement":
      return "bg-teal-500";
    case "trust_building":
      return "bg-amber-500";
    default:
      return "bg-zinc-500";
  }
}

function dimensionBadge(dimension: SkillDef["dimension"]): string {
  switch (dimension) {
    case "communication":
      return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900";
    case "deal_advancement":
      return "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900";
    case "trust_building":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700";
  }
}

export default async function SkillsPage() {
  const session = await auth();
  const uid = session?.user?.id;
  const email = session?.user?.email ?? "coach";

  const onboarded = await isOnboarded(uid);
  if (!onboarded) redirect("/onboarding");

  const states = await listSkillStates(uid);
  const stateMap = new Map(states.map((s) => [s.skillId, s]));

  // 按 dimension 分组，并把未练习过的技能补成 0% 掌握度
  const groups = SKILLS.reduce(
    (acc, skill) => {
      const state = stateMap.get(skill.id);
      const item = {
        skill,
        state,
        mastery: state ? Math.round(state.mastery * 100) : 0,
      };
      if (!acc[skill.dimension]) acc[skill.dimension] = [];
      acc[skill.dimension].push(item);
      return acc;
    },
    {} as Record<
      SkillDef["dimension"],
      { skill: SkillDef; state?: SkillState; mastery: number }[]
    >,
  );

  const dimensions: SkillDef["dimension"][] = ["communication", "deal_advancement", "trust_building"];

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <a
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white"
            >
              G
            </a>
            <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Global Sales Coach
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">技能图谱</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {email} · 13 维销售能力，按掌握度可视化
            </p>
          </div>
          <a
            href="/practice"
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            去演练 →
          </a>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {dimensions.map((dim) => {
            const items = groups[dim] ?? [];
            const avgMastery = Math.round(
              items.reduce((sum, i) => sum + i.mastery, 0) / (items.length || 1),
            );
            return (
              <div
                key={dim}
                className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${dimensionAccent(dim)}`} />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {DIMENSION_LABEL[dim]}
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{avgMastery}%</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{items.length} 项技能</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${dimensionAccent(dim)}`}
                    style={{ width: `${avgMastery}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-8">
          {dimensions.map((dim) => {
            const items = groups[dim] ?? [];
            return (
              <section key={dim}>
                <div className="mb-4 flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${dimensionAccent(dim)}`} />
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {DIMENSION_LABEL[dim]}
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map(({ skill, state, mastery }) => (
                    <a
                      key={skill.id}
                      href={`/practice?focus=${skill.id}`}
                      className="group rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                              {skill.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${dimensionBadge(dim)}`}
                            >
                              {DIMENSION_LABEL[dim]}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {skill.description}
                          </p>
                        </div>
                        <span className="shrink-0 text-lg font-bold text-zinc-900 dark:text-zinc-50">
                          {mastery}%
                        </span>
                      </div>

                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${dimensionAccent(dim)} transition-all group-hover:opacity-90`}
                          style={{ width: `${mastery}%` }}
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {state ? (
                          <>
                            <span>练习 {state.reps} 次</span>
                            {state.lapses > 0 && <span>遗忘 {state.lapses} 次</span>}
                            <span>难度 {difficultyLabel(state.difficulty)}</span>
                            {state.nextReview && (
                              <span>下次复习 {formatDate(state.nextReview)}</span>
                            )}
                          </>
                        ) : (
                          <span>还未练习，点击开始第一场</span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
