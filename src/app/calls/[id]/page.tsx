import { notFound } from "next/navigation";
import { getCall } from "@/lib/repo/call";
import { CALL_PURPOSES } from "@/lib/repo/types";
import { auth } from "@/auth";
import { CallView } from "./call-view";

function purposeLabel(p: string, other?: string | null): string {
  if (p === "other" && other) return other;
  return CALL_PURPOSES.find((x) => x.value === p)?.label ?? p;
}

/**
 * 模拟电话通话间：渲染客户信息 + 脚本骨架 + 对练组件。
 */
export default async function CallSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const uid = (await auth())?.user?.id;
  const call = await getCall(id, uid);
  if (!call) notFound();

  return (
    <main className="flex h-[100dvh] flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <a
            href="/calls"
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← 返回
          </a>
          <div className="min-w-0 flex-1 px-3 text-center">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
              📞 {call.customerSnapshot?.name ?? "客户"}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">
              {purposeLabel(call.purpose, call.purposeOther)}
              {call.customerSnapshot?.countryMarket
                ? ` · ${call.customerSnapshot.countryMarket}`
                : ""}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              call.status === "active"
                ? "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {call.status === "active" ? "通话中" : "已结束"}
          </span>
        </div>
      </header>

      <CallView
        callId={call.id}
        initialTurns={call.turns}
        customerName={call.customerSnapshot?.name ?? "客户"}
        status={call.status}
        scriptSkeleton={call.scriptSkeleton}
      />
    </main>
  );
}
