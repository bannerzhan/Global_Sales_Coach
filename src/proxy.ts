/**
 * Next.js 16 路由守卫（middleware 的正式继任者，见官方 proxy.ts 约定）。
 * 复用 src/auth.ts 的完整 auth 实例：
 *  - 有合法 JWT session → 放行
 *  - 无 session → 重定向到 /login（Auth.js pages.signIn 配置）
 *
 * 排除清单：/api/auth/*（Auth.js 自身端点）、/login、/register、静态资源。
 * Next 16 proxy 默认 Node runtime，可直接调用完整 auth（含 bcryptjs）。
 */
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    // 排除 auth 端点 / 登录页 / 注册页 / 静态资源，其余全走守卫
    "/((?!api/auth|login|register|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)",
  ],
};
