import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/repo/profile";
import { getLatestBaseline } from "@/lib/repo/assessment";
import { ASSESSMENT_DIM_LABEL } from "@/lib/llm/assessment";
import { AssessmentForm } from "./form";

/**
 * 基线评估页：展示上一次测评结果 + 重新测评入口。
 * 未 Onboarding → 回引导页。
 */
export default async function AssessmentPage() {
  const onboarded = await isOnboarded();
  if (!onboarded) redirect("/onboarding");

  const baseline = await getLatestBaseline();

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="mx-auto flex h-16 w-full max-w-lg items-center px-5">
        <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          能力基线评估
        </span>
      </header>
      <section className="mx-auto w-full max-w-lg flex-1 px-5 pb-10">
        {baseline && (
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">上次测评</h2>
            <ul className="mt-3 space-y-2.5">
              {baseline.dimensionScores.map((s) => (
                <li key={s.dimension}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {ASSESSMENT_DIM_LABEL[s.dimension as keyof typeof ASSESSMENT_DIM_LABEL] ?? s.dimension}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{s.score}/10</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${s.score * 10}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{s.summary}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              {baseline.overallSummary}
            </p>
          </div>
        )}

        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {baseline ? "重新测评" : "完成你的首次测评"}
        </h2>
        <AssessmentForm />
      </section>
    </main>
  );
}
