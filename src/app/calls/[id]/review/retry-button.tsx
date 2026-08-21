"use client";

import { useState, useTransition } from "react";
import { retryCallReview } from "../../actions";

/**
 * 通话复盘重试按钮（首次复盘失败时用）。
 */
export function CallReviewRetryButton({ callId }: { callId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const res = await retryCallReview(callId);
      if (!res.ok) setError(res.error ?? "重试失败，请稍后再试");
      else window.location.reload();
    });
  }

  return (
    <div className="mt-6 text-center">
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
      <button
        type="button"
        onClick={handleRetry}
        disabled={isPending}
        className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
      >
        {isPending ? "AI 正在复盘…" : "重新复盘"}
      </button>
    </div>
  );
}
