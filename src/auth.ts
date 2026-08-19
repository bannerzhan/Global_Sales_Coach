import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { env } from "@/lib/env";
import { pool } from "@/lib/db";
import { isDbAvailable } from "@/lib/repo/storage";

/**
 * Auth.js v5 多用户 Credentials 登录。
 * - DB 模式（部署）：authorize 查 users 表（email + bcrypt hash），session.user.id = 真实 UUID
 * - 本地模式（无 DB）：回退 env 单用户凭据（AUTH_USER_EMAIL / AUTH_USER_PASSWORD_HASH）
 * - 会话走 JWT（无 DB adapter，用户表仅作凭据源）
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

        if (await isDbAvailable()) {
          // 多用户：查 users 表（注册入口写入）
          try {
            const { rows } = await pool.query<{
              id: string;
              email: string;
              password_hash: string;
            }>(`SELECT id, email, password_hash FROM users WHERE email = $1`, [email]);
            const user = rows[0];
            if (!user) return null;
            const ok = await compare(password, user.password_hash);
            if (!ok) return null;
            return { id: user.id, name: user.email, email: user.email };
          } catch (err) {
            console.error("[auth] 查询 users 表失败", (err as Error).message);
            return null;
          }
        }

        // 本地模式（无 DB）：回退 env 单用户，避免开发环境被卡
        if (email !== env.AUTH_USER_EMAIL.trim().toLowerCase()) return null;
        const ok = await compare(password, env.AUTH_USER_PASSWORD_HASH);
        if (!ok) return null;
        return { id: "1", name: email, email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // 自部署多用户应用：Host 固定（本机 localhost:PORT 或 Caddy 反代域名），
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
