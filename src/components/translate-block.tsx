"use client";

import { useState, type ReactNode } from "react";

/** 语言转换图标（左右 swap） */
function SwapIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3l4 4-4 4" />
      <path d="M21 7H7" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M3 17h14" />
    </svg>
  );
}

/**
 * AI 文字块翻译组件（阅读辅助）。
 * - 在 AI 生成的 prose 块下方挂「译」按钮（带转换图标），与朗读按钮对齐；
 * - 点击单独调 /api/translate，整段译文展开在下方，按钮变「收」，再点收起；
 * - leading 可选：传入朗读按钮等，与「译」并排；
 * - children 为视觉内容（不传则仅渲染按钮+面板）。
 */
export function TranslateBlock({
  text,
  leading,
  children,
}: {
  text: string;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (translation) {
      setOpen(true);
      return;
    }
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
        setTranslation(res.translation);
        setOpen(true);
      }
    } catch {
      setError("翻译失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const btnCls =
    "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition " +
    (open
      ? "bg-teal-600 text-white"
      : "border border-zinc-300 bg-white text-zinc-600 hover:border-teal-400 hover:text-teal-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300");

  return (
    <div className="mt-1.5">
      {children}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {leading}
        <button type="button" onClick={handleToggle} disabled={loading} className={btnCls}>
          {loading ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
          ) : open ? (
            "收"
          ) : (
            <>
              <SwapIcon />
              译
            </>
          )}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
      {open && translation && (
        <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          {translation}
        </div>
      )}
    </div>
  );
}
