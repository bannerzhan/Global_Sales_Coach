"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAssessment } from "../onboarding/actions";

const ASSESS_DIMS = [
  { key: "communication", label: "沟通表达" },
  { key: "deal_advancement", label: "推进成交" },
  { key: "trust_building", label: "信任建立" },
] as const;
type SelfRatings = Record<(typeof ASSESS_DIMS)[number]["key"], number>;

export function AssessmentForm() {
  const router = useRouter();
  const [selfRatings, setSelfRatings] = useState<SelfRatings>({
    communication: 3,
    deal_advancement: 3,
    trust_building: 3,
  });
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    await submitAssessment({ selfRatings, context });
    router.push("/");
  }

  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        为你自己打个分（1-5，1=入门 5=熟练）。AI 会据此刷新你的能力基线。
      </p>
      {ASSESS_DIMS.map((d) => (
        <div key={d.key}>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {d.label}：{selfRatings[d.key]}/5
          </label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={selfRatings[d.key]}
            onChange={(e) => setSelfRatings((r) => ({ ...r, [d.key]: Number(e.target.value) }))}
            className="w-full accent-teal-600"
          />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          补充经历（选填）
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          placeholder="简单描述一段你最近的外贸沟通经历……"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="h-11 w-full rounded-lg bg-teal-600 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
      >
        {submitting ? "生成基线中…" : "重新测评"}
      </button>
    </div>
  );
}
