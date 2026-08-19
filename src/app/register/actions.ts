"use server";

import { hash } from "bcryptjs";
import { env } from "@/lib/env";
import { pool } from "@/lib/db";
import { isDbAvailable } from "@/lib/repo/storage";

/**
 * 注册（多用户，V0.2）。
 * - 邀请码：env.INVITE_CODE（空 = 关闭注册）
 * - 密码 bcrypt 入库 users 表；authorize 走 DB 查询（见 src/auth.ts）
 * - 邮箱唯一；注册成功后前端自动 signIn 登录
 */
export interface RegisterResult {
  ok: boolean;
  error?: string;
}

export async function register(input: {
  email: string;
  password: string;
  inviteCode: string;
}): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "邮箱格式不正确" };
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "密码至少 8 位" };
  }
  if (!env.INVITE_CODE) {
    return { ok: false, error: "注册已关闭" };
  }
  if (input.inviteCode.trim() !== env.INVITE_CODE) {
    return { ok: false, error: "邀请码错误" };
  }
  if (!(await isDbAvailable())) {
    return { ok: false, error: "服务暂不可用（未连接数据库），请稍后再试" };
  }

  try {
    const dup = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (dup.rows.length > 0) {
      return { ok: false, error: "该邮箱已注册，直接登录即可" };
    }
    const passwordHash = await hash(input.password, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (email) DO NOTHING`,
      [email, passwordHash],
    );
    return { ok: true };
  } catch (err) {
    console.error("[register] 注册失败", (err as Error).message);
    return { ok: false, error: "注册失败，请稍后重试" };
  }
}
