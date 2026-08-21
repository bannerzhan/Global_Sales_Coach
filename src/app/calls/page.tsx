import { listActiveCalls, listCompletedCalls } from "@/lib/repo/call";
import { CALL_PURPOSES } from "@/lib/repo/types";
import { auth } from "@/auth";

function purposeLabel(p: string, other?: string | null): string {
  if (p === "other" && other) return other;
  return CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;
}

/**
 * 模拟电话入口页：新建通话 + 进行中/已结束分区。
 */
export default async function CallsPage() {
  const uid = (await auth())?.user?.id;
  const active = await listActiveCalls(uid);
  const completed = await listCompletedCalls(uid);

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
              G
            </span>
            <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              模拟电话
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
        {/* 新建通话 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">打一通模拟电话</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            填好客户已知信息 + 这通电话的目的，AI 先生成脚本骨架，再陪你真打一通，打完自动复盘。
          </p>
          <div className="mt-4">
            <a
              href="/calls/new"
              className="inline-flex items-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              📞 新建通话
            </a>
          </div>
        </div>

        {/* 进行中的通话 */}
        {active.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">进行中的通话</h2>
            <ul className="mt-3 space-y-2.5">
              {active.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/calls/${c.id}`}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 transition hover:border-teal-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {c.customerSnapshot?.name ?? "客户"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {purposeLabel(c.purpose, c.purposeOther)} · {c.turns.length} 轮
                      </div>
                    </div>
                    <span className="text-sm font-medium text-teal-600 dark:text-teal-400">继续 →</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 已结束的通话 / 复盘 */}
        {completed.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">已结束的通话</h2>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              点「查看复盘」回顾四维度点评（开场破冰 / 异议处理 / 成交推进 / 收尾确认）
            </p>
            <ul className="mt-3 space-y-2.5">
              {completed.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/calls/${c.id}/review`}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 transition hover:border-teal-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {c.customerSnapshot?.name ?? "客户"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {purposeLabel(c.purpose, c.purposeOther)} · {c.turns.length} 轮 ·{" "}
                        {new Date(c.startedAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                      查看复盘 →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
