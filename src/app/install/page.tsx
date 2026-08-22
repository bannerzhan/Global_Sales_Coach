import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "手机安装 · Global Sales Coach",
  robots: { index: false },
};

async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-host");
  const host = fwd || h.get("host") || "82.157.183.237:3443";
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/`;
}

export default async function InstallPage() {
  const base = await resolveBaseUrl();
  const appUrl = base;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(appUrl)}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10 text-zinc-800 dark:text-zinc-100">
      <div className="mb-2 text-4xl">📱</div>
      <h1 className="text-center text-xl font-semibold">把 Global Sales Coach 装到手机</h1>
      <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
        无需 APK。用手机浏览器打开下面的地址，即可「添加到主屏幕」当 App 用。
      </p>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <img
          src={qr}
          alt="install qr"
          width={320}
          height={320}
          className="mx-auto h-56 w-56 rounded-lg"
        />
        <p className="mt-3 break-all text-center text-xs text-zinc-400">扫码，或用手机浏览器打开：</p>
        <a
          href={appUrl}
          className="mt-1 block break-all text-center text-sm font-medium text-teal-600"
        >
          {appUrl}
        </a>
      </div>

      <a
        href={appUrl}
        className="mt-5 w-full rounded-xl bg-teal-600 py-3 text-center text-sm font-semibold text-white shadow-sm"
      >
        在手机上打开应用
      </a>

      <section className="mt-8 w-full rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="font-semibold">Android（Chrome / Edge）</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-300">
          <li>用手机浏览器打开上面的地址。</li>
          <li>
            若出现「您的连接不是私密连接」：点 <b>高级</b> → <b>继续前往（不安全）</b>。
            这是自签证书，属正常提示。
          </li>
          <li>
            点右上角 ⋮ 菜单 → <b>添加到主屏幕</b>（或「安装应用」）。
          </li>
          <li>命名后确认，桌面即出现图标，点开即全屏运行，像原生 App。</li>
        </ol>

        <h2 className="mt-5 font-semibold">iPhone（Safari）</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-300">
          <li>用 Safari 打开上面的地址。</li>
          <li>点底部 <b>分享</b> 按钮 → <b>添加到主屏幕</b>。</li>
          <li>确认后桌面出现图标，点开全屏运行。</li>
        </ol>
      </section>

      <p className="mt-6 text-center text-xs text-zinc-400">
        调试提示：本应用 Service Worker 采用「网络优先」，每次都拉最新页面；登录态走网络，不受缓存影响。
        若安装菜单不出现，刷新一次或确认已接受证书后重试。
      </p>
    </main>
  );
}
