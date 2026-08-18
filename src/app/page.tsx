import { auth } from "@/auth";
import { SignOutButton } from "./sign-out-button";

/**
 * 首页（登录后可见，proxy.ts 已拦截未登录请求）。
 * 当前为学习闭环的占位仪表盘，Step 5/6 会替换为真实的
 * goal → scenario → roleplay 流程入口。
 */
export default async function HomePage() {
  const session = await auth();
  const email = session?.user?.email ?? "coach";

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
              G
            </span>
            <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Global Sales Coach
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          你好，{email}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          学习闭环（目标 → 场景 → 角色扮演 → 复盘）将在下一步开放。
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: "学习目标", desc: "Step 5 上线", icon: "🎯" },
            { title: "情景演练", desc: "Step 6 上线", icon: "🎭" },
            { title: "技能复盘", desc: "Step 6 上线", icon: "📈" },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-2xl">{c.icon}</div>
              <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">
                {c.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
