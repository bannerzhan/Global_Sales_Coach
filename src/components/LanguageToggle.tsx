"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/onboarding/actions";

/**
 * 演练语言切换开关（首页右上角）。
 * 切换后刷新页面，后续所有 AI 生成内容（场景/客户/复盘/评估/目标）跟随新语言。
 */
export function LanguageToggle({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = locale === "en" ? "en" : "zh-CN";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
      {(
        [
          { value: "zh-CN", label: "中" },
          { value: "en", label: "EN" },
        ] as const
      ).map((opt) => {
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocale(opt.value);
                router.refresh();
              })
            }
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
