import { pool } from "../db";
import { isDbAvailable, patchLocalUser, readLocalUser, resolveUid } from "./storage";

/**
 * 基线评估快照读写（assessments 表 / 本地 JSON 兜底）。
 * 单用户：DB 模式用真实 UUID；本地模式用 LOCAL_USER_ID。统一经 resolveUid。
 */

export interface DimensionScore {
  dimension: string;
  score: number; // 0-10
  summary: string;
}

export interface BaselineAssessment {
  userId: string;
  dimensionScores: DimensionScore[];
  overallSummary: string;
  selfRatings?: Record<string, number> | null;
  createdAt: string;
}

export async function saveBaseline(
  input: {
    dimensionScores: DimensionScore[];
    overallSummary: string;
    selfRatings?: Record<string, number> | null;
  },
  userId?: string,
): Promise<BaselineAssessment> {
  const uid = await resolveUid(userId);
  const createdAt = new Date().toISOString();

  if (await isDbAvailable()) {
    const { rows } = await pool.query<{ id: string; created_at: string }>(
      `INSERT INTO assessments (user_id, dimension_scores, overall_summary, self_ratings)
       VALUES ($1,$2,$3,$4)
       RETURNING id, created_at`,
      [
        uid,
        JSON.stringify(input.dimensionScores),
        input.overallSummary,
        input.selfRatings ? JSON.stringify(input.selfRatings) : null,
      ],
    );
    return {
      userId: uid,
      dimensionScores: input.dimensionScores,
      overallSummary: input.overallSummary,
      selfRatings: input.selfRatings ?? null,
      createdAt: rows[0]?.created_at ?? createdAt,
    };
  }

  // 本地兜底
  const baseline: BaselineAssessment = {
    userId: uid,
    dimensionScores: input.dimensionScores,
    overallSummary: input.overallSummary,
    selfRatings: input.selfRatings ?? null,
    createdAt,
  };
  await patchLocalUser(uid, { baseline });
  return baseline;
}

export async function getLatestBaseline(userId?: string): Promise<BaselineAssessment | null> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query<{
      dimension_scores: DimensionScore[];
      overall_summary: string;
      self_ratings: Record<string, number> | null;
      created_at: string;
    }>(
      `SELECT dimension_scores, overall_summary, self_ratings, created_at
       FROM assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [uid],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      userId: uid,
      dimensionScores: r.dimension_scores,
      overallSummary: r.overall_summary,
      selfRatings: r.self_ratings,
      createdAt: r.created_at,
    };
  }

  const user = await readLocalUser(uid);
  const baseline = user?.baseline as BaselineAssessment | undefined;
  return baseline ?? null;
}
