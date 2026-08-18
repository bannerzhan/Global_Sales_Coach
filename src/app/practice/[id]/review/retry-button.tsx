"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryReview } from "../../actions";

/** 复盘重试按钮：失败时重新跑一次 AI 点评 */
export function ReviewRetryButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await retryReview(sessionId);
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.error ?? "重试失败");
        }
      } catch {
        setError("重试失败，请稍后再试");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="h-11 w-full rounded-lg bg-teal-600 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
      >
        {isPending ? "AI 正在复盘…" : "重新复盘"}
      </button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
