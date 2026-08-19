import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "./register-form";

/**
 * 注册页（多用户，V0.2）。
 * 已登录访问 → 直接回首页；未登录 → 渲染注册表单。
 * proxy.ts 已把本页排除在守卫外。
 */
export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-teal-50 via-white to-white px-5 py-12 dark:from-zinc-950 dark:via-black dark:to-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-2xl font-bold text-white shadow-lg shadow-teal-600/20">
            G
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Global Sales Coach
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            创建账号，开始 AI 销售训练
          </p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
