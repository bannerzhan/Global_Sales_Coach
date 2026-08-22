"use client";

import { useState } from "react";

/** 翻译小工具图标（地球） */
function GlobeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

/**
 * 输入框上方翻译小框（组句 / 查词辅助）。
 * - 默认收起，点输入框旁地球图标才展开成横条；
 * - 自动识别方向：含中文→英，含英文→中；
 * - 翻译成功即自动把译文填入主输入框（光标处/末尾），无需「填入」按钮；
 *   填入后清空本框、保持展开，方便继续翻译；
 * - 回车=翻译；失败显示「翻译失败，点此重试」。
 */
export function TranslateBox({ onFill }: { onFill: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function doTranslate() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (!res.ok || !res.translation) {
        setError(res.error ?? "翻译失败");
      } else {
        // 翻译成功 → 直接填入主输入框，无需二次点击
        onFill(res.translation);
        setText("");
        setError("");
      }
    } catch {
      setError("翻译失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(v: string) {
    setText(v);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doTranslate();
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="翻译小工具"
        aria-label="翻译小工具"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-500 transition hover:border-teal-400 hover:text-teal-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        <GlobeIcon />
      </button>
    );
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
        <input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="翻译：输入中文组句 / 英文查词"
          className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={doTranslate}
          disabled={loading || !text.trim()}
          className="h-8 shrink-0 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "翻译"
          )}
        </button>
      </div>
      {error && <p className="mt-1 px-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
