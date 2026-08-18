import { notFound } from "next/navigation";
import { getRoleplaySession } from "@/lib/repo/attempt";
import { getScenario } from "@/lib/repo/scenario";
import { getLatestReview, retryReview } from "../../actions";
import { skillById } from "@/lib/repo/skills";
import { ReviewRetryButton } from "./retry-button";

const DIM_LABEL: Record<string, string> = {
  communication: "沟通表达",
  deal_advancement: "推进成交",
  trust_building: "信任建立",
};

/**
 * 复盘页：展示 AI 教练的结构化点评 + 技能掌握度变化。
 * 无复盘结果时提供重试按钮（首次复盘失败场景）。
 */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getRoleplaySession(id);
  if (!session) notFound();
  const scenario = await getScenario(session.scenarioId);

  const review = await getLatestReview(id);

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <a
            href="/practice"
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← 演练列表
          </a>
          <span className="truncate px-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            演练复盘
          </span>
          <a
            href="/"
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            首页
          </a>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {review ? (
          <>
            {/* 总分 */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div
                className={`text-5xl font-bold ${
                  review.score >= 7
                    ? "text-teal-600"
                    : review.score >= 4
                      ? "text-amber-500"
                      : "text-red-500"
                }`}
              >
                {review.score.toFixed(1)}
              </div>
              <div className="mt-1 text-sm text-zinc-400">综合评分 / 10</div>
              <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                {scenario?.title ?? "演练"}
              </div>
            </div>

            {/* 维度分 */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {review.dimensionScores.map((d) => (
                <div
                  key={d.dimension}
                  className="rounded-xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                    {d.score.toFixed(1)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">
                    {DIM_LABEL[d.dimension] ?? d.dimension}
                  </div>
                </div>
              ))}
            </div>

            {/* 亮点 */}
            <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-5 dark:border-teal-900 dark:bg-teal-950/30">
              <h3 className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                💡 亮点
              </h3>
              <ul className="mt-2.5 space-y-2">
                {review.highlights.map((h, i) => (
                  <li key={i} className="text-sm leading-relaxed text-teal-900 dark:text-teal-200">
                    · {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* 改进建议 */}
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                🎯 改进建议
              </h3>
              <ul className="mt-2.5 space-y-2">
                {review.improvements.map((imp, i) => (
                  <li
                    key={i}
                    className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
                  >
                    {i + 1}. {imp}
                  </li>
                ))}
              </ul>
            </div>

            {/* 技能变化 */}
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                📊 技能掌握度变化
              </h3>
              <ul className="mt-2.5 space-y-2">
                {review.skillUpdates.map((su, i) => {
                  const def = skillById(su.skillId);
                  return (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {def?.name ?? su.skillId}
                        <span className="ml-1.5 text-xs text-zinc-400">{su.note}</span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          su.delta >= 0 ? "text-teal-600" : "text-red-500"
                        }`}
                      >
                        {su.delta >= 0 ? "+" : ""}
                        {(su.delta * 100).toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 逐轮点评 */}
            {review.turnFeedback.length > 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  💬 逐轮点评
                </h3>
                <ul className="mt-2.5 space-y-2">
                  {review.turnFeedback.map((tf, i) => (
                    <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">
                        第 {tf.turnIndex} 轮
                      </span>
                      ：{tf.comment}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <a
                href="/practice"
                className="flex h-11 flex-1 items-center justify-center rounded-lg bg-teal-600 font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                再来一场
              </a>
              <a
                href="/"
                className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-200 font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                回首页
              </a>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-3xl">🤔</div>
            <h2 className="mt-3 font-semibold text-zinc-900 dark:text-zinc-50">
              复盘结果还没生成
            </h2>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              可能是 AI 点评时出了点问题，重试一次。
            </p>
            <div className="mt-5">
              <ReviewRetryButton sessionId={id} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
