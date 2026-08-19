"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage, finishPractice } from "../actions";
import type { RoleplayTurn } from "@/lib/repo/types";
import { VoiceInputButton } from "@/components/voice-input-button";
import { VoicePlayButton } from "@/components/voice-play-button";

/**
 * 角色扮演聊天界面（移动端优先）。
 * 发送 → 追加用户气泡 → AI 客户回复 → 追加 AI 气泡；底部自动滚动。
 */
export function ChatView({
  sessionId,
  initialTurns,
  scenarioTitle,
  status,
}: {
  sessionId: string;
  initialTurns: RoleplayTurn[];
  scenarioTitle: string;
  status: string;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<RoleplayTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, sending]);

  const active = status === "active";

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending || !active) return;
    setInput("");
    setError(null);

    // 乐观更新：立刻把用户自己的气泡显示出来（不等服务器往返）
    const optimisticTurn: RoleplayTurn = {
      role: "user",
      content: text,
      pressureStep: 0,
      createdAt: new Date().toISOString(),
    };
    setTurns((t) => [...t, optimisticTurn]);
    setSending(true);

    startTransition(async () => {
      const res = await sendMessage(sessionId, text);
      if (res.ok && res.aiTurn) {
        // 只追加 AI 客户回复（用户气泡已乐观显示，避免重复）
        setTurns((t) => [...t, res.aiTurn!]);
      } else {
        // 回滚乐观插入的用户气泡，并恢复输入框
        setTurns((t) => t.filter((x) => x !== optimisticTurn));
        setInput(text);
        setError(res.error ?? "发送失败，请重试");
      }
      setSending(false);
    });
  }

  function handleFinish() {
    if (!active || isPending) return;
    startTransition(async () => {
      try {
        await finishPractice(sessionId); // 内部 redirect 到复盘页
      } catch {
        setError("结束失败，请重试");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      {/* 消息区 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t, i) => (
          <MessageBubble key={i} turn={t} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-4 pb-1 text-center text-sm text-red-500">{error}</div>
      )}

      {/* 输入区 */}
      {active ? (
        <div className="border-t border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="你的发言（Enter 发送，🎤 语音输入）"
              className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <VoiceInputButton
              disabled={sending || !active}
              onText={(t) => setInput((prev) => (prev ? `${prev}${t}` : t))}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-10 shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              发送
            </button>
          </form>
          <button
            type="button"
            onClick={handleFinish}
            disabled={isPending || turns.length < 2}
            className="mt-2 w-full rounded-lg border border-zinc-200 py-2 text-sm text-zinc-500 transition hover:border-teal-300 hover:text-teal-600 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-800 dark:hover:text-teal-400"
          >
            {isPending ? "AI 正在复盘…" : "结束演练并复盘"}
          </button>
        </div>
      ) : (
        <div className="border-t border-zinc-200 bg-white/90 px-4 py-4 text-center dark:border-zinc-800 dark:bg-zinc-950/90">
          <a
            href={`/practice/${sessionId}/review`}
            className="text-sm font-medium text-teal-600 dark:text-teal-400"
          >
            查看复盘结果 →
          </a>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ turn }: { turn: RoleplayTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? "rounded-tr-sm bg-teal-600 text-white"
              : "rounded-tl-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          }`}
        >
          {turn.content}
        </div>
        {!isUser && (
          <div className="mt-1">
            <VoicePlayButton text={turn.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
