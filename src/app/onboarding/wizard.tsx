"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHANNEL_OPTIONS,
  ENGLISH_DIMENSIONS,
  MARKET_OPTIONS,
  type EnglishDimension,
  type Profile,
} from "@/lib/repo/types";
import {
  suggestGoalsAction,
  submitOnboarding,
  type OnboardingInput,
} from "./actions";
import type { GoalSuggestion } from "@/lib/llm/goal-suggest";

/** 与 actions.ts 的 OnboardingInput.profile 一致（不含 userId/updatedAt） */
type ProfileInput = OnboardingInput["profile"];

/** 基线评估的 3 个聚合维度（本地定义，避免把 server 模块打进 client bundle） */
const ASSESS_DIMS = [
  { key: "communication", label: "沟通表达" },
  { key: "deal_advancement", label: "推进成交" },
  { key: "trust_building", label: "信任建立" },
] as const;
type SelfRatings = Record<(typeof ASSESS_DIMS)[number]["key"], number>;

const STEPS = ["基本信息", "投入与水平", "学习目标", "能力自评"] as const;

const EMPTY_PROFILE: ProfileInput = {
  occupation: "",
  industry: "",
  markets: [],
  channels: [],
  dailyMinutes: 30,
  englishLevel: {},
  locale: "zh-CN",
  timezone: "Asia/Shanghai",
};

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileInput>(EMPTY_PROFILE);
  const [goals, setGoals] = useState<GoalSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfRatings, setSelfRatings] = useState<SelfRatings>({
    communication: 3,
    deal_advancement: 3,
    trust_building: 3,
  });
  const [assessContext, setAssessContext] = useState("");

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  async function handleSuggest() {
    setError(null);
    setSuggesting(true);
    try {
      const res = await suggestGoalsAction(profile);
      if (res.ok && res.goals) setGoals(res.goals);
      else setError(res.error ?? "生成失败，请稍后重试或手动填写");
    } catch {
      setError("生成失败，请稍后重试或手动填写");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit() {
    if (goals.length === 0) {
      setError("请至少添加一个学习目标");
      return;
    }
    setError(null);
    setSubmitting(true);
    await submitOnboarding({ profile, goals, selfRatings, context: assessContext });
    // submitOnboarding 内部 redirect，这里兜底刷新
    router.push("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-10">
      {/* 步骤指示 */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className={`h-1 rounded-full transition-colors ${
                i <= step ? "bg-teal-600" : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
            <span
              className={`text-xs ${
                i === step
                  ? "font-medium text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-5">
            <TextField
              label="你的职位"
              value={profile.occupation}
              onChange={(v) => set("occupation", v)}
              placeholder="如：外贸业务员 / 销售经理"
            />
            <TextField
              label="所在行业"
              value={profile.industry}
              onChange={(v) => set("industry", v)}
              placeholder="如：促销礼品 / 消费电子"
            />
            <ChipGroup
              label="目标市场（可多选）"
              options={MARKET_OPTIONS}
              selected={profile.markets}
              onToggle={(v) =>
                set(
                  "markets",
                  profile.markets.includes(v)
                    ? profile.markets.filter((x) => x !== v)
                    : [...profile.markets, v],
                )
              }
            />
            <ChipGroup
              label="获客渠道（可多选）"
              options={CHANNEL_OPTIONS}
              selected={profile.channels}
              onToggle={(v) =>
                set(
                  "channels",
                  profile.channels.includes(v)
                    ? profile.channels.filter((x) => x !== v)
                    : [...profile.channels, v],
                )
              }
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                每天可投入时间：{profile.dailyMinutes} 分钟
              </label>
              <input
                type="range"
                min={5}
                max={240}
                step={5}
                value={profile.dailyMinutes}
                onChange={(e) => set("dailyMinutes", Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <div className="flex justify-between text-xs text-zinc-400">
                <span>5 分钟</span>
                <span>240 分钟</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                英语水平自评（1-5，1=入门 5=流利）
              </label>
              <div className="space-y-2.5">
                {ENGLISH_DIMENSIONS.map((dim) => (
                  <div key={dim} className="flex items-center justify-between gap-3">
                    <span className="w-16 text-sm text-zinc-600 dark:text-zinc-400">
                      {DIM_LABEL[dim]}
                    </span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            set("englishLevel", {
                              ...profile.englishLevel,
                              [dim]: n,
                            })
                          }
                          className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                            profile.englishLevel[dim] === n
                              ? "bg-teal-600 text-white"
                              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
            >
              {suggesting ? "AI 正在分析你的画像…" : "✨ 让 AI 生成学习目标建议"}
            </button>

            {goals.length > 0 && (
              <div className="space-y-3">
                {goals.map((g, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <input
                      value={g.title}
                      onChange={(e) =>
                        setGoals((gs) =>
                          gs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                        )
                      }
                      className="w-full bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-zinc-100"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{g.rationale}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <input
                        type="date"
                        value={g.targetDate ?? ""}
                        onChange={(e) =>
                          setGoals((gs) =>
                            gs.map((x, j) =>
                              j === i ? { ...x, targetDate: e.target.value || null } : x,
                            ),
                          )
                        }
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}
                        className="text-xs text-zinc-400 hover:text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setGoals((gs) => [
                  ...gs,
                  { title: "", targetDate: null, rationale: "自定义目标" },
                ])
              }
              className="w-full rounded-lg border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-500 transition hover:border-teal-500 hover:text-teal-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              + 手动添加目标
            </button>
          </div>
        )}

      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            为你自己打个分（1-5，1=入门 5=熟练）。AI 会据此生成你的能力基线，约 1 分钟。
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
                onChange={(e) =>
                  setSelfRatings((r) => ({ ...r, [d.key]: Number(e.target.value) }))
                }
                className="w-full accent-teal-600"
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              补充经历（选填）
            </label>
            <textarea
              value={assessContext}
              onChange={(e) => setAssessContext(e.target.value)}
              rows={3}
              placeholder="简单描述一段你最近的外贸沟通经历，帮助 AI 更准判断……"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>
      )}

      </div>

      {/* 底部导航 */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={submitting}
            className="h-11 w-28 rounded-lg border border-zinc-200 font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            上一步
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="h-11 flex-1 rounded-lg bg-zinc-900 font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            下一步
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-11 flex-1 rounded-lg bg-teal-600 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {submitting ? "生成基线中…" : "开始训练 🚀"}
          </button>
        )}
      </div>
    </div>
  );
}

const DIM_LABEL: Record<EnglishDimension, string> = {
  reading: "阅读",
  listening: "听力",
  speaking: "口语",
  writing: "写作",
};

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
