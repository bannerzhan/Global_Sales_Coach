import { getBudgetStatus } from "@/lib/llm/accounting";

/**
 * 预算状态横幅（server component）。
 * 展示当日 / 月度花费与告警；无 DB 时显示本地降级提示。
 */
export async function BudgetStatus() {
  const b = await getBudgetStatus();

  if (!b.dbConnected) {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
        本地开发模式：未连接数据库，成本护栏按 fail-open 运行（不拦截）。
      </div>
    );
  }

  const daily = b.userDaily;
  const hasAlert = b.recentAlerts.length > 0;
  const dailyPct = daily && daily.limitYuan > 0 ? Math.min(100, Math.round((daily.usedYuan / daily.limitYuan) * 100)) : 0;

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">成本护栏</span>
        {hasAlert && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {b.recentAlerts.length} 条告警
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        今日花费 ¥{(daily?.usedYuan ?? 0).toFixed(3)} / ¥{(daily?.limitYuan ?? 0).toFixed(2)}
        {daily?.alertYuan != null && `（告警线 ¥${daily.alertYuan.toFixed(2)}）`}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${dailyPct >= 80 ? "bg-red-500" : "bg-teal-500"}`}
          style={{ width: `${dailyPct}%` }}
        />
      </div>
    </div>
  );
}
