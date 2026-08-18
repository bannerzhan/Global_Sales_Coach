import { notFound } from "next/navigation";
import { getRoleplaySession } from "@/lib/repo/attempt";
import { getScenario } from "@/lib/repo/scenario";
import { ChatView } from "./chat";

/**
 * 角色扮演会话页：渲染场景信息 + 对话历史 + 聊天组件。
 */
export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getRoleplaySession(id);
  if (!session) notFound();

  const scenario = await getScenario(session.scenarioId);

  return (
    <main className="flex h-[100dvh] flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <a
            href="/practice"
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← 返回
          </a>
          <div className="min-w-0 flex-1 px-3 text-center">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {scenario?.title ?? "演练"}
            </div>
            {scenario && (
              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                {scenario.persona.role} · {scenario.persona.nationality} · 难度{" "}
                {"★".repeat(scenario.difficulty)}
                {"☆".repeat(5 - scenario.difficulty)}
              </div>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              session.status === "active"
                ? "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {session.status === "active" ? "进行中" : "已结束"}
          </span>
        </div>
      </header>

      <ChatView
        sessionId={session.id}
        initialTurns={session.turns}
        scenarioTitle={scenario?.title ?? "演练"}
        status={session.status}
      />
    </main>
  );
}
