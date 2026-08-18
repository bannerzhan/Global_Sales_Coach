import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

/**
 * 登录页。
 * 已登录访问 → 直接回首页；未登录 → 渲染表单。
 * proxy.ts 已把本页排除在守卫外，这里用服务端 auth() 兜底处理已登录态。
 */
export default async function LoginPage() {
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
            AI 驱动的销售能力训练教练
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          单用户版本 · 凭据由部署管理员配置
        </p>
      </div>
    </main>
  );
}
