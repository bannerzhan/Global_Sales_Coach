import { randomUUID } from "crypto";
import { pool } from "../db";
import type { Goal } from "./types";
import { getOrCreateUserId, isDbAvailable, LOCAL_USER_ID, localGetUser, localSaveUser } from "./storage";

/**
 * 学习目标 repo：listGoals / addGoal。
 */

function rowToGoal(row: Record<string, unknown>, userId: string): Goal {
  // pg-node 把 timestamp 默认解析成 Date 对象（不是 string），直接渲染会炸 React
  const td = row.target_date;
  return {
    id: row.id as string,
    userId,
    title: row.title as string,
    targetDate:
      td == null ? null : td instanceof Date ? td.toISOString().slice(0, 10) : String(td),
    status: (row.status as Goal["status"]) ?? "active",
    createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString(),
  };
}

export async function listGoals(userId?: string): Promise<Goal[]> {
  const uid = userId ?? LOCAL_USER_ID;
  if (await isDbAvailable()) {
    const dbUid = userId ?? (await getOrCreateUserId());
    const { rows } = await pool.query(
      "SELECT * FROM goals WHERE user_id = $1 AND status != 'abandoned' ORDER BY created_at",
      [dbUid],
    );
    return rows.map((r) => rowToGoal(r, dbUid));
  }
  const user = await localGetUser(uid);
  return ((user?.goals as Goal[] | undefined) ?? []).filter((g) => g.status !== "abandoned");
}

export async function addGoal(
  data: { title: string; targetDate?: string | null },
  userId?: string,
): Promise<Goal> {
  const uid = userId ?? LOCAL_USER_ID;
  if (await isDbAvailable()) {
    const dbUid = userId ?? (await getOrCreateUserId());
    const { rows } = await pool.query(
      `INSERT INTO goals (user_id, title, target_date, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [dbUid, data.title, data.targetDate ?? null],
    );
    return rowToGoal(rows[0], dbUid);
  }
  const goal: Goal = {
    id: randomUUID(),
    userId: uid,
    title: data.title,
    targetDate: data.targetDate ?? null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const user = (await localGetUser(uid)) ?? { userId: uid };
  await localSaveUser(uid, {
    goals: [...((user.goals as Goal[] | undefined) ?? []), goal],
  });
  return goal;
}
