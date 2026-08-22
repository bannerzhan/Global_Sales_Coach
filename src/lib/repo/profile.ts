import { pool } from "../db";
import { DEFAULT_PROFILE, type Profile } from "./types";
import { isDbAvailable, patchLocalUser, readLocalUser, resolveUid } from "./storage";

/**
 * 用户画像 repo：getProfile / saveProfile / isOnboarded。
 * DB / 本地 JSON 双后端，接口一致。
 */

function rowToProfile(row: Record<string, unknown>, userId: string): Profile {
  return {
    userId,
    occupation: (row.occupation as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    markets: Array.isArray(row.markets) ? (row.markets as string[]) : [],
    channels: Array.isArray(row.channels) ? (row.channels as string[]) : [],
    dailyMinutes: Number(row.daily_minutes ?? 30),
    englishLevel: (row.english_level as Profile["englishLevel"]) ?? {},
    locale: (row.locale as string) ?? "zh-CN",
    timezone: (row.timezone as string) ?? "Asia/Shanghai",
    updatedAt: new Date((row.updated_at as string) ?? Date.now()).toISOString(),
  };
}

export async function getProfile(userId?: string): Promise<Profile | null> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [uid]);
    return rows[0] ? rowToProfile(rows[0], uid) : null;
  }
  const user = await readLocalUser(uid);
  const stored = user?.profile as Partial<Profile> | undefined;
  if (!stored) return null;
  return { userId: uid, ...DEFAULT_PROFILE, ...stored } as Profile;
}

export async function saveProfile(
  data: Omit<Profile, "userId" | "updatedAt">,
  userId?: string,
): Promise<Profile> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO profiles
        (user_id, occupation, industry, markets, channels, daily_minutes, english_level, locale, timezone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (user_id) DO UPDATE SET
        occupation = EXCLUDED.occupation,
        industry = EXCLUDED.industry,
        markets = EXCLUDED.markets,
        channels = EXCLUDED.channels,
        daily_minutes = EXCLUDED.daily_minutes,
        english_level = EXCLUDED.english_level,
        locale = EXCLUDED.locale,
        timezone = EXCLUDED.timezone,
        updated_at = now()
      RETURNING *`,
      [
        uid,
        data.occupation,
        data.industry,
        JSON.stringify(data.markets),
        JSON.stringify(data.channels),
        data.dailyMinutes,
        JSON.stringify(data.englishLevel),
        data.locale,
        data.timezone,
      ],
    );
    return rowToProfile(rows[0], uid);
  }
  const profile: Profile = { userId: uid, ...data, updatedAt: new Date().toISOString() };
  await patchLocalUser(uid, { profile });
  return profile;
}

/** 是否已完成 Onboarding（profile 存在且填了核心字段） */
export async function isOnboarded(userId?: string): Promise<boolean> {
  const p = await getProfile(userId);
  if (!p) return false;
  // 有职位 或 有市场/行业 就算完成过引导（允许后续零散补充）
  return Boolean(p.occupation || p.industry || p.markets.length > 0);
}
