import { pool } from "../db";
import { skillById, type SkillState } from "./skills";
import { reviewFsrs, masteryFromStability, mapDeltaToRating, DEFAULT_RETENTION, type Rating } from "../fsrs";
import { getOrCreateUserId, isDbAvailable, LOCAL_USER_ID, localGetUser, localSaveUser } from "./storage";

/**
 * 技能掌握状态 repo（skill_states 表映射）。
 *
 * V0.2 起走完整 FSRS-4.5 内核：复盘产出 skillUpdates（delta）后，
 * 把 delta 映射成 FSRS 评级(1-4)，用 stability/difficulty 五参数模型更新状态，
 * mastery 由 stability 派生，nextReview 由 FSRS 间隔推出。DB schema 字段已就绪。
 */

const STATES_KEY = "skillStates";

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

/** 待复习技能：nextReview <= now */
export async function dueSkillStates(userId?: string): Promise<SkillState[]> {
  const now = Date.now();
  return (await listSkillStates(userId)).filter(
    (s) => s.nextReview != null && new Date(s.nextReview).getTime() <= now,
  );
}

/** 复盘后批量更新技能状态：delta → FSRS 评级 → 更新 S/D/mastery/复习计划 */
export async function applySkillUpdates(
  updates: { skillId: string; delta: number }[],
  userId?: string,
): Promise<SkillState[]> {
  const results: SkillState[] = [];
  const now = Date.now();
  for (const u of updates) {
    const def = skillById(u.skillId);
    if (!def) continue;
    const prev = await getSkillState(u.skillId, userId);
    const prevState = prev
      ? {
          stability: prev.stability,
          difficulty: prev.difficulty,
          reps: prev.reps,
          lapses: prev.lapses,
          lastReview: prev.lastReview ? new Date(prev.lastReview).getTime() : null,
          nextReview: prev.nextReview ? new Date(prev.nextReview).getTime() : null,
        }
      : { stability: 0, difficulty: 5, reps: 0, lapses: 0, lastReview: null, nextReview: null };

    const rating: Rating = mapDeltaToRating(u.delta);
    const next = reviewFsrs(prevState, rating, now, DEFAULT_RETENTION);
    const state: SkillState = {
      userId: userId ?? LOCAL_USER_ID,
      skillId: u.skillId,
      mastery: masteryFromStability(next.stability),
      stability: next.stability,
      difficulty: next.difficulty,
      reps: next.reps,
      lapses: next.lapses,
      nextReview: new Date(next.nextReview!).toISOString(),
      lastReview: new Date(next.lastReview!).toISOString(),
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
    stability: Number(row.stability ?? 0),
    difficulty: Number(row.difficulty ?? 5),
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
         stability = EXCLUDED.stability,
         difficulty = EXCLUDED.difficulty,
         reps = EXCLUDED.reps,
         lapses = EXCLUDED.lapses,
         last_review = EXCLUDED.last_review,
         next_review = EXCLUDED.next_review,
         updated_at = now()`,
      [
        dbUid,
        state.skillId,
        state.mastery,
        state.stability,
        state.difficulty,
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
