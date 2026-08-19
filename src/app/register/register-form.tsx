"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { register } from "./actions";

/**
 * 注册表单：邮箱 + 密码 + 邀请码。
 * 成功 → 自动登录跳首页；失败 → 表单内红字提示。
 */
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await register({ email, password, inviteCode });
      if (!res.ok) {
        setError(res.error ?? "注册失败");
        return;
      }
      // 注册成功自动登录
      const r = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (r?.error) {
        // 注册成功但登录异常：去登录页手动登
        router.push("/login?registered=1");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          邮箱
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          密码
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          邀请码
        </label>
        <input
          type="text"
          required
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="向管理员索要邀请码"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
      >
        {busy ? "注册中…" : "创建账号"}
      </button>

      <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
        已有账号？
        <Link href="/login" className="text-teal-600 hover:underline dark:text-teal-400">
          直接登录
        </Link>
      </p>
    </form>
  );
}
