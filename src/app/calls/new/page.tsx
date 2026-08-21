"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCall,
  listCustomersAction,
  type CreateCallInput,
} from "../actions";
import { CALL_PURPOSES, type CallPurpose, type Customer, type OurSideInfo } from "@/lib/repo/types";

/**
 * 新建通话简报表单（客户端）。
 * 选客户（档案库）/ 新建客户 + 通话目的 + 我们信息 → 提交生成脚本骨架并进通话间。
 */
export default function NewCallPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState<string>("");
  const [purpose, setPurpose] = useState<CallPurpose>("follow_up_inquiry");
  const [purposeOther, setPurposeOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [newC, setNewC] = useState({
    name: "",
    countryMarket: "",
    role: "",
    mainProduct: "",
    history: "",
    painPoints: "",
    notes: "",
  });
  const [ourSide, setOurSide] = useState<OurSideInfo>({
    product: "",
    pricePosition: "",
    relationStage: "",
    pastInteractions: "",
  });

  useEffect(() => {
    listCustomersAction().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  function field(
    key: keyof typeof newC,
    label: string,
    placeholder: string,
  ) {
    return (
      <label className="block">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <input
          value={newC[key]}
          onChange={(e) => setNewC((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
    );
  }

  function handleSubmit() {
    setError(null);
    if (mode === "new" && !newC.name.trim()) {
      setError("请填写客户名/公司");
      return;
    }
    if (mode === "existing" && !customerId) {
      setError("请选择一个客户，或切到「新建客户」");
      return;
    }

    const input: CreateCallInput = {
      purpose,
      purposeOther: purpose === "other" ? purposeOther : null,
      ourSide,
    };
    if (mode === "existing") {
      input.customerId = customerId;
    } else {
      input.newCustomer = {
        name: newC.name.trim(),
        countryMarket: newC.countryMarket.trim(),
        role: newC.role.trim(),
        mainProduct: newC.mainProduct.trim(),
        history: newC.history.trim(),
        painPoints: newC.painPoints.trim(),
        notes: newC.notes.trim(),
      };
    }

    startTransition(async () => {
      const res = await createCall(input);
      if (res.ok && res.id) {
        router.push(`/calls/${res.id}`);
      } else {
        setError(res.error ?? "创建通话失败，请重试");
      }
    });
  }

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <a href="/calls" className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              ← 返回
            </a>
            <span className="ml-2 font-semibold text-zinc-900 dark:text-zinc-50">新建通话</span>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-5 py-7">
        {/* 客户 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">客户</h2>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`rounded-lg px-3 py-1.5 text-sm ${mode === "existing" ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
            >
              选择已有客户
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-lg px-3 py-1.5 text-sm ${mode === "new" ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
            >
              新建客户
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {mode === "existing" ? (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">— 选择客户档案 —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.countryMarket || "未知市场"}）
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field("name", "客户名/公司 *", "如 Acme Trading Co.")}
                {field("countryMarket", "国家市场", "如 美国 / 德国")}
                {field("role", "职位", "如 采购经理 / 老板")}
                {field("mainProduct", "主营产品", "如 户外家具")}
                {field("history", "跟我们历史", "如 试样过 / 下过 2 单")}
                {field("painPoints", "已知痛点", "如 交期不稳")}
                <label className="block sm:col-span-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">备注</span>
                  <input
                    value={newC.notes}
                    onChange={(e) => setNewC((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="其他需要 AI 知道的"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* 通话目的 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">这通电话的目的</h2>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as CallPurpose)}
            className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {CALL_PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {purpose === "other" && (
            <input
              value={purposeOther}
              onChange={(e) => setPurposeOther(e.target.value)}
              placeholder="请说明这通电话的目的"
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          )}
        </div>

        {/* 我们信息 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">我们这边信息</h2>
          <div className="mt-3 space-y-3">
            {(
              [
                ["product", "产品/报价立场", "如 这款 LED 灯，FOB 深圳 $3.2/pcs"],
                ["pricePosition", "报价立场", "如 底价 $3.0，授权可到 $2.9"],
                ["relationStage", "关系阶段", "如 试样通过，准备小批量"],
                ["pastInteractions", "过往互动", "如 上周发了样品，客户反馈不错"],
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
                <input
                  value={ourSide[k]}
                  onChange={(e) => setOurSide((p) => ({ ...p, [k]: e.target.value }))}
                  placeholder={ph}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            ))}
          </div>
        </div>

        {error && <div className="text-center text-sm text-red-500">{error}</div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {isPending ? "生成脚本骨架中…" : "生成脚本骨架并开打 →"}
        </button>
      </section>
    </main>
  );
}
