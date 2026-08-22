import { randomUUID } from "crypto";
import { pool } from "../db";
import type { Attempt, RoleplaySession, RoleplayTurn } from "./types";
import { isDbAvailable, patchLocalUser, readLocalUser, resolveUid } from "./storage";

/**
 * 演练会话与记录 repo：roleplay session + attempts（双后端）。
 */

const SESSIONS_KEY = "roleplaySessions";
const ATTEMPTS_KEY = "attempts";

// ---------------- Roleplay Sessions ----------------

function rowToSession(row: Record<string, unknown>, userId: string): RoleplaySession {
  return {
    id: row.id as string,
    userId,
    scenarioId: row.scenario_id as string,
    status: (row.status as RoleplaySession["status"]) ?? "active",
    turns: Array.isArray(row.turns) ? (row.turns as RoleplayTurn[]) : [],
    startedAt: new Date((row.started_at as string) ?? Date.now()).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
  };
}

export async function createRoleplaySession(
  scenarioId: string,
  openingTurn: RoleplayTurn,
  userId?: string,
): Promise<RoleplaySession> {
  const uid = await resolveUid(userId);
  const session: RoleplaySession = {
    id: randomUUID(),
    userId: uid,
    scenarioId,
    status: "active",
    turns: [openingTurn],
    startedAt: new Date().toISOString(),
    endedAt: null,
  };

  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO roleplay_sessions (id, user_id, scenario_id, status, turns)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING *`,
      [session.id, uid, scenarioId, JSON.stringify(session.turns)],
    );
    return rowToSession(rows[0], uid);
  }
  await patchLocalUser(uid, {
    [SESSIONS_KEY]: [...((await readLocalUser(uid))[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? [], session],
  });
  return session;
}

export async function getRoleplaySession(
  id: string,
  userId?: string,
): Promise<RoleplaySession | null> {
  // DB 模式必须显式传 userId：不传则直接返回 null（拒绝用占位 id 误读他人数据）
  if ((await isDbAvailable()) && !userId) return null;
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM roleplay_sessions WHERE id = $1 AND user_id = $2",
      [id, uid],
    );
    return rows[0] ? rowToSession(rows[0], uid) : null;
  }
  const user = await readLocalUser(uid);
  return ((user?.[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? []).find((s) => s.id === id) ?? null;
}

export async function appendTurn(
  sessionId: string,
  turn: RoleplayTurn,
  userId?: string,
): Promise<RoleplaySession | null> {
  const uid = await resolveUid(userId);
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) return null;

  const updated: RoleplaySession = { ...session, turns: [...session.turns, turn] };
  if (await isDbAvailable()) {
    await pool.query(
      "UPDATE roleplay_sessions SET turns = $1 WHERE id = $2 AND user_id = $3",
      [JSON.stringify(updated.turns), sessionId, uid],
    );
    return updated;
  }
  const user = await readLocalUser(uid);
  const sessions = (user[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? [];
  await patchLocalUser(uid, {
    [SESSIONS_KEY]: sessions.map((s) => (s.id === sessionId ? updated : s)),
  });
  return updated;
}

export async function completeSession(
  sessionId: string,
  userId?: string,
): Promise<RoleplaySession | null> {
  const uid = await resolveUid(userId);
  const session = await getRoleplaySession(sessionId, uid);
  if (!session) return null;
  const updated: RoleplaySession = {
    ...session,
    status: "completed",
    endedAt: new Date().toISOString(),
  };
  if (await isDbAvailable()) {
    await pool.query(
      "UPDATE roleplay_sessions SET status = 'completed', ended_at = now() WHERE id = $1 AND user_id = $2",
      [sessionId, uid],
    );
    return updated;
  }
  const user = await readLocalUser(uid);
  const sessions = (user[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? [];
  await patchLocalUser(uid, {
    [SESSIONS_KEY]: sessions.map((s) => (s.id === sessionId ? updated : s)),
  });
  return updated;
}

export async function listActiveSessions(userId?: string): Promise<RoleplaySession[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM roleplay_sessions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC",
      [uid],
    );
    return rows.map((r) => rowToSession(r, uid));
  }
  const user = await readLocalUser(uid);
  return ((user?.[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? []).filter(
    (s) => s.status === "active",
  );
}

export async function listCompletedSessions(userId?: string): Promise<RoleplaySession[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM roleplay_sessions WHERE user_id = $1 AND status = 'completed' ORDER BY started_at DESC",
      [uid],
    );
    return rows.map((r) => rowToSession(r, uid));
  }
  const user = await readLocalUser(uid);
  return ((user?.[SESSIONS_KEY] as RoleplaySession[] | undefined) ?? []).filter(
    (s) => s.status === "completed",
  );
}

// ---------------- Attempts ----------------

function rowToAttempt(row: Record<string, unknown>, userId: string): Attempt {
  return {
    id: row.id as string,
    userId,
    scenarioId: (row.scenario_id as string | null) ?? null,
    taskType: row.task_type as string,
    userInput: row.user_input as string,
    evaluation: (row.evaluation as Record<string, unknown> | null) ?? null,
    score: row.score === null ? null : Number(row.score),
    isRetry: Boolean(row.is_retry),
    attemptNo: Number(row.attempt_no ?? 1),
    createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString(),
  };
}

export async function createAttempt(
  data: Omit<Attempt, "id" | "userId" | "createdAt">,
  userId?: string,
): Promise<Attempt> {
  const uid = await resolveUid(userId);
  const attempt: Attempt = {
    id: randomUUID(),
    userId: uid,
    ...data,
    createdAt: new Date().toISOString(),
  };

  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO attempts
        (id, user_id, scenario_id, task_type, user_input, evaluation, score, is_retry, attempt_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        attempt.id,
        uid,
        attempt.scenarioId,
        attempt.taskType,
        attempt.userInput,
        attempt.evaluation ? JSON.stringify(attempt.evaluation) : null,
        attempt.score,
        attempt.isRetry,
        attempt.attemptNo,
      ],
    );
    return rowToAttempt(rows[0], uid);
  }
  const user = await readLocalUser(uid);
  await patchLocalUser(uid, {
    [ATTEMPTS_KEY]: [...((user[ATTEMPTS_KEY] as Attempt[] | undefined) ?? []), attempt],
  });
  return attempt;
}

export async function listAttempts(userId?: string): Promise<Attempt[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [uid],
    );
    return rows.map((r) => rowToAttempt(r, uid));
  }
  const user = await readLocalUser(uid);
  return ((user?.[ATTEMPTS_KEY] as Attempt[] | undefined) ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
