import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { env } from "@/lib/env";

/**
 * Auth.js v5 单用户 Credentials 登录。
 * - 凭据不落库：邮箱 + bcrypt hash 都在环境变量里（.env / deploy.sh 注入）
 * - 会话走 JWT（无 DB adapter，单用户无需持久化会话）
 * - `authorized` 回调供 src/proxy.ts 用作路由守卫（Next 16 proxy 默认 Node runtime，
 *   可直接复用完整 auth 实例，无需 Edge split-config）
 *
 * 安全说明：登录失败统一返回 null（不区分"用户不存在/密码错误"），
 * 避免用户枚举；bcrypt 比对自带 timing 抗性。
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "credentials",
      name: "邮箱密码",
      credentials: {
        email: { label: "邮箱", type: "email", placeholder: "you@example.com" },
        password: { label: "密码", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        // 单用户：直接与 env 中的固定邮箱比对，避免用户枚举
        if (email !== env.AUTH_USER_EMAIL.trim().toLowerCase()) return null;
        const ok = await compare(password, env.AUTH_USER_PASSWORD_HASH);
        if (!ok) return null;
        return { id: "1", name: email, email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // 自部署单用户应用：Host 固定（本机 localhost:PORT 或 Caddy 反代域名），
  // 不启用 host 白名单校验（否则反代场景会报 UntrustedHost）
  trustHost: true,
  callbacks: {
    // proxy 守卫：无 session 一律拒绝（会重定向到 pages.signIn）
    authorized({ auth: session }) {
      return !!session?.user;
    },
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    },
  },
});
