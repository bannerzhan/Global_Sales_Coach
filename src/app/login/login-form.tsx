"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

/**
 * 登录表单（客户端组件）。
 * 直接调 Auth.js 客户端 signIn("credentials")，成功后 redirectTo 首页；
 * 失败统一提示"邮箱或密码错误"（不区分具体原因，防枚举）。
 */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    startTransition(async () => {
      try {
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
          redirectTo: "/",
        });
        if (res?.error) {
          setError("邮箱或密码错误");
          return;
        }
        router.push("/");
        router.refresh();
      } catch {
        setError("登录失败，请稍后重试");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400"
        >
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@example.com"
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3.5 text-base text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-lg bg-teal-600 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "登录中…" : "登录"}
      </button>
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        还没有账号？
        <Link
          href="/register"
          className="font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          注册一个
        </Link>
      </p>
    </form>
  );
}
