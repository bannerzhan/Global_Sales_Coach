import { randomUUID } from "crypto";
import { pool } from "../db";
import type {
  CallPurpose,
  CallReviewResult,
  CallScript,
  CallSession,
  CallTurn,
  Customer,
  OurSideInfo,
} from "./types";
import { isDbAvailable, patchLocalUser, readLocalUser, resolveUid } from "./storage";

/**
 * 模拟电话 repo：customers（档案库）/ calls（通话记录）/ call_reviews（四维度复盘）。
 * 双后端（PG / 本地 JSON），接口一致，多用户隔离。
 */

const CUSTOMERS_KEY = "customers";
const CALLS_KEY = "calls";
const CALL_REVIEWS_KEY = "callReviews";

// ---------------- Customers ----------------

function rowToCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: (row.name as string) ?? "",
    countryMarket: (row.country_market as string) ?? "",
    role: (row.role as string) ?? "",
    mainProduct: (row.main_product as string) ?? "",
    history: (row.history as string) ?? "",
    painPoints: (row.pain_points as string) ?? "",
    notes: (row.notes as string) ?? "",
    createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString(),
    updatedAt: new Date((row.updated_at as string) ?? Date.now()).toISOString(),
  };
}

export type NewCustomer = Omit<Customer, "id" | "userId" | "createdAt" | "updatedAt">;

export async function createCustomer(data: NewCustomer, userId?: string): Promise<Customer> {
  const uid = await resolveUid(userId);
  const now = new Date().toISOString();
  const customer: Customer = { id: randomUUID(), userId: uid, ...data, createdAt: now, updatedAt: now };

  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO customers (id, user_id, name, country_market, role, main_product, history, pain_points, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        customer.id,
        uid,
        customer.name,
        customer.countryMarket,
        customer.role,
        customer.mainProduct,
        customer.history,
        customer.painPoints,
        customer.notes,
      ],
    );
    return rowToCustomer(rows[0]);
  }
  const user = await readLocalUser(uid);
  await patchLocalUser(uid, {
    [CUSTOMERS_KEY]: [...((user[CUSTOMERS_KEY] as Customer[] | undefined) ?? []), customer],
  });
  return customer;
}

export async function listCustomers(userId?: string): Promise<Customer[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE user_id = $1 ORDER BY created_at DESC",
      [uid],
    );
    return rows.map(rowToCustomer);
  }
  const user = await readLocalUser(uid);
  return ((user?.[CUSTOMERS_KEY] as Customer[] | undefined) ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getCustomer(id: string, userId?: string): Promise<Customer | null> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE id = $1 AND user_id = $2",
      [id, uid],
    );
    return rows[0] ? rowToCustomer(rows[0]) : null;
  }
  const user = await readLocalUser(uid);
  return ((user?.[CUSTOMERS_KEY] as Customer[] | undefined) ?? []).find((c) => c.id === id) ?? null;
}

// ---------------- Calls ----------------

function rowToCall(row: Record<string, unknown>): CallSession {
  const c = (row.customer_snapshot as Customer | null) ?? null;
  const script = (row.script_skeleton as CallScript | null) ?? null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    customerId: (row.customer_id as string | null) ?? null,
    customerSnapshot: c,
    purpose: (row.purpose as CallPurpose) ?? "other",
    purposeOther: (row.purpose_other as string | null) ?? null,
    ourSide: (row.our_side as OurSideInfo) ?? { product: "", pricePosition: "", relationStage: "", pastInteractions: "" },
    scriptSkeleton: script,
    status: (row.status as CallSession["status"]) ?? "active",
    turns: Array.isArray(row.turns) ? (row.turns as CallTurn[]) : [],
    transcript: (row.transcript as string | null) ?? null,
    startedAt: new Date((row.started_at as string) ?? Date.now()).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
  };
}

export interface NewCallInput {
  userId: string;
  customerId: string | null;
  customerSnapshot: Customer | null;
  purpose: CallPurpose;
  purposeOther: string | null;
  ourSide: OurSideInfo;
  scriptSkeleton: CallScript | null;
  openingTurn?: CallTurn;
}

export async function createCall(input: NewCallInput): Promise<CallSession> {
  const session: CallSession = {
    id: randomUUID(),
    userId: input.userId,
    customerId: input.customerId,
    customerSnapshot: input.customerSnapshot,
    purpose: input.purpose,
    purposeOther: input.purposeOther,
    ourSide: input.ourSide,
    scriptSkeleton: input.scriptSkeleton,
    status: "active",
    turns: input.openingTurn ? [input.openingTurn] : [],
    transcript: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };

  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO calls (id, user_id, customer_id, customer_snapshot, purpose, purpose_other, our_side, script_skeleton, status, turns)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
       RETURNING *`,
      [
        session.id,
        input.userId,
        session.customerId,
        session.customerSnapshot ? JSON.stringify(session.customerSnapshot) : null,
        session.purpose,
        session.purposeOther,
        JSON.stringify(session.ourSide),
        session.scriptSkeleton ? JSON.stringify(session.scriptSkeleton) : null,
        JSON.stringify(session.turns),
      ],
    );
    return rowToCall(rows[0]);
  }
  const user = await readLocalUser(input.userId);
  await patchLocalUser(input.userId, {
    [CALLS_KEY]: [...((user[CALLS_KEY] as CallSession[] | undefined) ?? []), session],
  });
  return session;
}

export async function getCall(id: string, userId?: string): Promise<CallSession | null> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM calls WHERE id = $1 AND user_id = $2",
      [id, uid],
    );
    return rows[0] ? rowToCall(rows[0]) : null;
  }
  const user = await readLocalUser(uid);
  return ((user?.[CALLS_KEY] as CallSession[] | undefined) ?? []).find((c) => c.id === id) ?? null;
}

export async function appendCallTurn(
  callId: string,
  turn: CallTurn,
  userId?: string,
): Promise<CallSession | null> {
  const uid = await resolveUid(userId);
  const call = await getCall(callId, uid);
  if (!call) return null;
  const updated: CallSession = { ...call, turns: [...call.turns, turn] };
  if (await isDbAvailable()) {
    await pool.query("UPDATE calls SET turns = $1 WHERE id = $2 AND user_id = $3", [
      JSON.stringify(updated.turns),
      callId,
      uid,
    ]);
    return updated;
  }
  const user = await readLocalUser(uid);
  const calls = (user[CALLS_KEY] as CallSession[] | undefined) ?? [];
  await patchLocalUser(uid, {
    [CALLS_KEY]: calls.map((c) => (c.id === callId ? updated : c)),
  });
  return updated;
}

export async function completeCall(
  callId: string,
  transcript: string,
  userId?: string,
): Promise<CallSession | null> {
  const uid = await resolveUid(userId);
  const call = await getCall(callId, uid);
  if (!call) return null;
  const updated: CallSession = {
    ...call,
    status: "completed",
    transcript,
    endedAt: new Date().toISOString(),
  };
  if (await isDbAvailable()) {
    await pool.query(
      "UPDATE calls SET status = 'completed', transcript = $1, ended_at = now() WHERE id = $2 AND user_id = $3",
      [transcript, callId, uid],
    );
    return updated;
  }
  const user = await readLocalUser(uid);
  const calls = (user[CALLS_KEY] as CallSession[] | undefined) ?? [];
  await patchLocalUser(uid, {
    [CALLS_KEY]: calls.map((c) => (c.id === callId ? updated : c)),
  });
  return updated;
}

export async function listActiveCalls(userId?: string): Promise<CallSession[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM calls WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC",
      [uid],
    );
    return rows.map(rowToCall);
  }
  const user = await readLocalUser(uid);
  return ((user?.[CALLS_KEY] as CallSession[] | undefined) ?? []).filter((c) => c.status === "active");
}

export async function listCompletedCalls(userId?: string): Promise<CallSession[]> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM calls WHERE user_id = $1 AND status = 'completed' ORDER BY started_at DESC",
      [uid],
    );
    return rows.map(rowToCall);
  }
  const user = await readLocalUser(uid);
  return ((user?.[CALLS_KEY] as CallSession[] | undefined) ?? []).filter((c) => c.status === "completed");
}

// ---------------- Call Reviews ----------------

export async function saveCallReview(
  callId: string,
  userId: string,
  review: CallReviewResult,
): Promise<void> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    await pool.query(
      `INSERT INTO call_reviews (call_id, user_id, review)
       VALUES ($1,$2,$3)`,
      [callId, uid, JSON.stringify(review)],
    );
    return;
  }
  const user = await readLocalUser(uid);
  await patchLocalUser(uid, {
    [CALL_REVIEWS_KEY]: [
      ...((user[CALL_REVIEWS_KEY] as { callId: string; review: CallReviewResult }[] | undefined) ?? []),
      { callId, review },
    ],
  });
}

export async function getCallReview(
  callId: string,
  userId?: string,
): Promise<CallReviewResult | null> {
  const uid = await resolveUid(userId);
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT review FROM call_reviews WHERE call_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1",
      [callId, uid],
    );
    return rows[0] ? (rows[0].review as CallReviewResult) : null;
  }
  const user = await readLocalUser(uid);
  const list = (user?.[CALL_REVIEWS_KEY] as { callId: string; review: CallReviewResult }[] | undefined) ?? [];
  const found = list.find((r) => r.callId === callId);
  return found ? found.review : null;
}
