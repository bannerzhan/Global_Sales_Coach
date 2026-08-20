import { notFound } from "next/navigation";
import { getRoleplaySession } from "@/lib/repo/attempt";
import { getScenario } from "@/lib/repo/scenario";
import { auth } from "@/auth";
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
  const uid = (await auth())?.user?.id;
  const session = await getRoleplaySession(id, uid);
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
            {/* 顶部：场景标题 + 小分 + 重试 */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {scenario?.title ?? "演练复盘"}
                </h1>
                <p className="mt-1 text-xs text-zinc-400">
                  综合评分 {" "}
                  <span
                    className={`font-bold ${
                      review.score >= 7
                        ? "text-teal-600"
                        : review.score >= 4
                          ? "text-amber-500"
                          : "text-red-500"
                    }`}
                  >
                    {review.score.toFixed(1)}
                  </span>{" "}
                  / 10
                </p>
              </div>
              <div className="shrink-0">
                <ReviewRetryButton sessionId={id} className="" />
              </div>
            </div>

            {/* 核心：逐句客户话术解剖 */}
            {(review.customerSentenceAnalysis ?? []).length > 0 ? (
              <div className="mt-5 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  🔍 客户每句话拆解
                </h2>
                {[...(review.customerSentenceAnalysis ?? [])]
                  .sort((a, b) => a.turnIndex - b.turnIndex)
                  .map((item, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                          第 {item.turnIndex} 轮
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {item.negotiationAngle}
                        </span>
                      </div>

                      <div className="mt-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
                        <div className="text-xs text-zinc-400">客户说</div>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                          “{item.customerQuote}”
                        </p>
                      </div>

                      <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          意图：
                        </span>
                        {item.intent}
                      </div>

                      {item.userResponse && (
                        <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            你的回应：
                          </span>
                          “{item.userResponse}”
                        </div>
                      )}

                      <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          点评：
                        </span>
                        {item.assessment}
                      </div>

                      <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                        <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
                          更优回应
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-teal-900 dark:text-teal-200">
                          {item.betterResponse}
                        </p>
                      </div>

                      <div className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        💡 {item.keyTakeaway}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/30">
                <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  本次复盘未生成逐句分析
                </h2>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">
                  可能是 AI 输出超时或格式异常。点击下方按钮重新生成，会拿到逐句客户话术解剖。
                </p>
                <div className="mt-3 w-full">
                  <ReviewRetryButton sessionId={id} />
                </div>
              </div>
            )}

            {/* 关键改进建议 */}
            {review.improvements.length > 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  🎯 关键改进建议
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
            )}

            {/* 技能变化 */}
            {review.skillUpdates.length > 0 && (
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
            )}

            {/* 维度分（弱化放底部） */}
            {review.dimensionScores.length > 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  📈 维度评分
                </h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {review.dimensionScores.map((d) => (
                    <div key={d.dimension} className="text-center">
                      <div className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
                        {d.score.toFixed(1)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {DIM_LABEL[d.dimension] ?? d.dimension}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {d.comment}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 语言/商业反馈 */}
            {(review.feedbackLanguage?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  ✍️ 表达改进
                </h3>
                <ul className="mt-2.5 space-y-2">
                  {review.feedbackLanguage.map((fb, i) => (
                    <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      · {fb}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(review.feedbackBusiness?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  ⚠️ 商业规则核实
                </h3>
                <ul className="mt-2.5 space-y-2">
                  {review.feedbackBusiness.map((fb, i) => (
                    <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                      · {fb}
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
            <div className="mt-5 w-full">
              <ReviewRetryButton sessionId={id} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
