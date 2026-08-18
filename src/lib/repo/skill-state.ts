import { pool } from "../db";
import { skillById, type SkillState } from "./skills";
import { getOrCreateUserId, isDbAvailable, LOCAL_USER_ID, localGetUser, localSaveUser } from "./storage";

/**
 * 技能掌握状态 repo（skill_states 表映射）。
 *
 * V0.1 用"简化 FSRS"：复盘产出 skillUpdates（delta）后，
 * 按 掌握度加权移动平均 + 指数复习间隔 更新状态。
 * 完整 FSRS 内核（stability/difficulty 五参数）留到后续版本，
 * 但表字段已预留（DB schema 一致）。
 */

const STATES_KEY = "skillStates";

/** 简化复习间隔（天），按掌握度指数递增 */
export function nextIntervalDays(mastery: number): number {
  if (mastery >= 0.85) return 7;
  if (mastery >= 0.7) return 4;
  if (mastery >= 0.5) return 2;
  return 1;
}

export async function getSkillState(skillId: string, userId?: string): Promise<SkillState | null> {
  const uid = userId ?? LOCAL_USER_ID;
  if (await isDbAvailable()) {
    const dbUid = await getOrCreateUserId();
    const { rows } = await pool.query(
      "SELECT * FROM skill_states WHERE user_id = $1 AND skill_id = $2",
      [dbUid, skillId],
    );
    if (!rows[0]) return null;
    return rowToState(rows[0], dbUid);
  }
  const user = await localGetUser(uid);
  return ((user?.[STATES_KEY] as SkillState[] | undefined) ?? []).find((s) => s.skillId === skillId) ?? null;
}

export async function listSkillStates(userId?: string): Promise<SkillState[]> {
  const uid = userId ?? LOCAL_USER_ID;
  if (await isDbAvailable()) {
    const dbUid = await getOrCreateUserId();
    const { rows } = await pool.query(
      "SELECT * FROM skill_states WHERE user_id = $1 ORDER BY mastery DESC",
      [dbUid],
    );
    return rows.map((r) => rowToState(r, dbUid));
  }
  const user = await localGetUser(uid);
  return ((user?.[STATES_KEY] as SkillState[] | undefined) ?? []).sort(
    (a, b) => b.mastery - a.mastery,
  );
}

/** 复盘后批量更新技能状态：mastery 移动平均 + 复习计划推进 */
export async function applySkillUpdates(
  updates: { skillId: string; delta: number }[],
  userId?: string,
): Promise<SkillState[]> {
  const results: SkillState[] = [];
  for (const u of updates) {
    const def = skillById(u.skillId);
    if (!def) continue;
    const prev = await getSkillState(u.skillId, userId);
    const prevMastery = prev?.mastery ?? 0;
    // delta 范围 -1..1（复盘给出），clamp 到 0-1
    const mastery = Math.min(1, Math.max(0, prevMastery + u.delta));
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + nextIntervalDays(mastery));
    const state: SkillState = {
      userId: userId ?? LOCAL_USER_ID,
      skillId: u.skillId,
      mastery,
      reps: (prev?.reps ?? 0) + 1,
      lapses: (prev?.lapses ?? 0) + (u.delta < -0.1 ? 1 : 0),
      nextReview: next.toISOString(),
      lastReview: now.toISOString(),
    };
    results.push(state);
    await upsertState(state, userId);
  }
  return results;
}

function rowToState(row: Record<string, unknown>, userId: string): SkillState {
  return {
    userId,
    skillId: row.skill_id as string,
    mastery: Number(row.mastery ?? 0),
    reps: Number(row.reps ?? 0),
    lapses: Number(row.lapses ?? 0),
    nextReview: row.next_review ? new Date(row.next_review as string).toISOString() : null,
    lastReview: row.last_review ? new Date(row.last_review as string).toISOString() : null,
  };
}

async function upsertState(state: SkillState, userId?: string): Promise<void> {
  const uid = userId ?? LOCAL_USER_ID;
  if (await isDbAvailable()) {
    const dbUid = await getOrCreateUserId();
    await pool.query(
      `INSERT INTO skill_states
         (user_id, skill_id, mastery, stability, difficulty, reps, lapses, last_review, next_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, skill_id) DO UPDATE SET
         mastery = EXCLUDED.mastery,
         reps = EXCLUDED.reps,
         lapses = EXCLUDED.lapses,
         last_review = EXCLUDED.last_review,
         next_review = EXCLUDED.next_review,
         updated_at = now()`,
      [
        dbUid,
        state.skillId,
        state.mastery,
        0, // stability 占位（简化版）
        5, // difficulty 占位
        state.reps,
        state.lapses,
        state.lastReview,
        state.nextReview,
      ],
    );
    return;
  }
  const user = (await localGetUser(uid)) ?? { userId: uid };
  const states = (user[STATES_KEY] as SkillState[] | undefined) ?? [];
  const idx = states.findIndex((s) => s.skillId === state.skillId);
  if (idx >= 0) states[idx] = state;
  else states.push(state);
  await localSaveUser(uid, { [STATES_KEY]: states });
}
