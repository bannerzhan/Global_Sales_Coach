"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { callSendMessage, finishCall } from "../actions";
import type { CallScript, CallTurn } from "@/lib/repo/types";
import { VoiceInputButton } from "@/components/voice-input-button";
import { VoicePlayButton } from "@/components/voice-play-button";
import { TranslateBlock } from "@/components/translate-block";
import { TranslateBox } from "@/components/translate-box";

/** 40 轮硬上限（用户可随时主动结束） */
export const MAX_CALL_TURNS = 40;

/**
 * 模拟电话通话间（移动端优先，文字版对练）。
 * 📞 客户来电气泡 + 通话脚本骨架参考 + 结束通话（触发四维度复盘）。
 * V1 文字对练；V2 在此叠实时语音（中继 WS + 字幕）。
 */
export function CallView({
  callId,
  initialTurns,
  customerName,
  status,
  scriptSkeleton,
}: {
  callId: string;
  initialTurns: CallTurn[];
  customerName: string;
  status: string;
  scriptSkeleton: CallScript | null;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<CallTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, sending]);

  const active = status === "active";
  const reachedCap = turns.length >= MAX_CALL_TURNS;

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending || !active || reachedCap) return;
    setInput("");
    setError(null);

    const optimisticTurn: CallTurn = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setTurns((t) => [...t, optimisticTurn]);
    setSending(true);

    startTransition(async () => {
      const res = await callSendMessage(callId, text);
      if (res.ok && res.aiTurn) {
        setTurns((t) => [...t, res.aiTurn!]);
      } else {
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
        await finishCall(callId); // 内部 redirect 到复盘页
      } catch {
        setError("结束失败，请重试");
      }
    });
  }

  function insertAtCursor(fill: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setInput((prev) => (prev ? prev + fill : fill));
      return;
    }
    const start = ta.selectionStart ?? input.length;
    const end = ta.selectionEnd ?? input.length;
    const next = input.slice(0, start) + fill + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + fill.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      {/* 通话脚本骨架（开场→异议→推进→收尾） */}
      {scriptSkeleton && (
        <details className="mx-4 mt-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
          <summary className="cursor-pointer text-sm font-medium text-teal-800 dark:text-teal-300">
            📝 通话脚本骨架（点击展开/收起）
          </summary>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <div>
              <span className="font-medium text-teal-700 dark:text-teal-400">开场：</span>
              {scriptSkeleton.openingSuggestion}
            </div>
            {scriptSkeleton.likelyObjections.length > 0 && (
              <div>
                <span className="font-medium text-teal-700 dark:text-teal-400">可能异议：</span>
                {scriptSkeleton.likelyObjections.join("；")}
              </div>
            )}
            {scriptSkeleton.advancePoints.length > 0 && (
              <div>
                <span className="font-medium text-teal-700 dark:text-teal-400">推进要点：</span>
                {scriptSkeleton.advancePoints.join("；")}
              </div>
            )}
            <div>
              <span className="font-medium text-teal-700 dark:text-teal-400">收尾：</span>
              {scriptSkeleton.closingSuggestion}
            </div>
          </div>
        </details>
      )}

      {/* 消息区 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t, i) => (
          <MessageBubble key={i} turn={t} customerName={customerName} />
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

      {error && <div className="px-4 pb-1 text-center text-sm text-red-500">{error}</div>}

      {/* 输入区 */}
      {active ? (
        <div className="border-t border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          {reachedCap && (
            <div className="mb-2 text-center text-xs text-amber-600 dark:text-amber-400">
              已达 {MAX_CALL_TURNS} 轮上限，可以结束通话了
            </div>
          )}
          <TranslateBox onFill={insertAtCursor} />
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="对客户说话（Enter 发送，🎤 语音输入）"
              className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <VoiceInputButton
              disabled={sending || !active || reachedCap}
              onText={(t) => setInput((prev) => (prev ? `${prev}${t}` : t))}
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || reachedCap}
              className="h-10 shrink-0 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              发送
            </button>
          </form>
          <button
            type="button"
            onClick={handleFinish}
            disabled={isPending || turns.length < 2}
            className="mt-2 w-full rounded-lg border border-red-200 py-2 text-sm text-red-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
          >
            {isPending ? "AI 正在复盘…" : "📞 结束通话并复盘"}
          </button>
        </div>
      ) : (
        <div className="border-t border-zinc-200 bg-white/90 px-4 py-4 text-center dark:border-zinc-800 dark:bg-zinc-950/90">
          <a
            href={`/calls/${callId}/review`}
            className="text-sm font-medium text-teal-600 dark:text-teal-400"
          >
            查看复盘结果 →
          </a>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ turn, customerName }: { turn: CallTurn; customerName: string }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        {!isUser && (
          <div className="mb-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            📞 {customerName} 来电
          </div>
        )}
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
          <TranslateBlock
            text={turn.content}
            leading={<VoicePlayButton text={turn.content} />}
          />
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
