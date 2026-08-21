import { notFound } from "next/navigation";
import { getCall, getCallReview } from "@/lib/repo/call";
import { CALL_PURPOSES } from "@/lib/repo/types";
import { auth } from "@/auth";
import { TranslateBlock } from "@/components/translate-block";
import { CallReviewRetryButton } from "./retry-button";

function purposeLabel(p: string, other?: string | null): string {
  if (p === "other" && other) return other;
  return CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;
}

const DIM_ICON: Record<string, string> = {
  opening: "🫱",
  objection: "⚔️",
  advance: "🎯",
  closing: "✅",
};

/**
 * 模拟电话复盘页：四维度卡片（开场破冰/异议处理/成交推进/收尾确认）。
 */
export default async function CallReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const uid = (await auth())?.user?.id;
  const call = await getCall(id, uid);
  if (!call) notFound();

  const review = await getCallReview(id, uid);
  const customerName = call.customerSnapshot?.name ?? "客户";

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <a
              href="/calls"
              className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← 返回
            </a>
            <span className="ml-2 font-semibold text-zinc-900 dark:text-zinc-50">通话复盘</span>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="font-semibold text-zinc-900 dark:text-zinc-50">
            📞 和 {customerName} 的通话复盘
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {purposeLabel(call.purpose, call.purposeOther)} · {call.turns.length} 轮 ·{" "}
            {new Date(call.startedAt).toLocaleDateString("zh-CN")}
          </p>

          {review ? (
            <div className="mt-6">
              {/* 总分 */}
              <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
                <div className="text-4xl font-bold text-teal-600 dark:text-teal-400">
                  {review.overallScore.toFixed(1)}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    本通电话总分
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    / 10 · 四维度平均
                  </div>
                </div>
              </div>

              {/* 四维度 */}
              <div className="mt-5 space-y-3">
                {review.dimensions.map((d) => (
                  <div
                    key={d.key}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{DIM_ICON[d.key] ?? "📌"}</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {d.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${d.score * 10}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-zinc-400">
                          {d.score.toFixed(1)}/10
                        </span>
                      </div>
                    </div>
                    <TranslateBlock text={d.comment}>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        {d.comment}
                      </p>
                    </TranslateBlock>
                    {d.betterResponse && (
                      <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                        <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
                          更优话术
                        </div>
                        <TranslateBlock text={d.betterResponse}>
                          <p className="mt-1 text-sm leading-relaxed text-teal-900 dark:text-teal-200">
                            {d.betterResponse}
                          </p>
                        </TranslateBlock>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 亮点 */}
              {review.highlights.length > 0 && (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">💡 亮点</div>
                  <ul className="mt-2 space-y-1.5">
                    {review.highlights.map((h, i) => (
                      <li key={i}>
                        <TranslateBlock text={h}>
                          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{h}</p>
                        </TranslateBlock>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 改进 */}
              {review.improvements.length > 0 && (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">📈 改进建议</div>
                  <ul className="mt-2 space-y-1.5">
                    {review.improvements.map((imp, i) => (
                      <li key={i}>
                        <TranslateBlock text={imp}>
                          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{imp}</p>
                        </TranslateBlock>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6">
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                本次复盘还没生成（AI 暂时繁忙或网络波动）。
              </p>
              <CallReviewRetryButton callId={call.id} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
