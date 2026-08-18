"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPractice } from "./actions";

/** 新建演练按钮：调 server action 生成场景并开演练 */
export function CreatePracticeButton({
  disabled,
  focusSkillId,
  label,
}: {
  disabled?: boolean;
  focusSkillId?: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        await createPractice(focusSkillId); // 内部 redirect 到会话页
      } catch (err) {
        setError(err instanceof Error ? err.message : "生成失败，请重试");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "AI 正在生成场景…" : (label ?? "🎭 生成场景并开始演练")}
      </button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
