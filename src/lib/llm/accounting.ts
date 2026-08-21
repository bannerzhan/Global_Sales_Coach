import { pool } from "../db";
import { isDbAvailable } from "../repo/storage";
import { promises as fs } from "fs";
import path from "path";

/**
 * AI 调用记账 + 成本护栏（对应 ai_runs / cost_budgets / cost_alerts 表）。
 *
 * 记账：每次 LLM 调用落一条 ai_runs，含 provider / token 明细 / cost_estimate / session_id / 状态。
 * 护栏：四级预算（request / session / user_daily / global，global = 100 元/月）。
 *   - request：单次估算成本直接比对
 *   - session / user_daily / global：累计已花费 + 本次
 *   超限行为 warn（告警继续）/ degrade（降级用 turbo）/ block（拒绝调用）。
 * 告警：任何触发告警阈值（alert_yuan）或上限的事件都落入 cost_alerts，**记录不静默**。
 *
 * ⚠️ 定价常量为估算值，部署前必须按火山方舟官网实际计价校准。
 */

// 供应商标识（V0.1 仅火山方舟）
export const PROVIDER = "volc-ark";

// ---------------------------------------------------------------------------
// 定价（元 / 千 token）—— 估算，TODO: 上线前按官网校准
// ---------------------------------------------------------------------------
const PRICING: Record<string, { input: number; output: number; reasoning: number }> = {
  pro: { input: 0.002, output: 0.008, reasoning: 0.002 },
  turbo: { input: 0.001, output: 0.004, reasoning: 0 },
  flash: { input: 0.0002, output: 0.002, reasoning: 0 },
  default: { input: 0.002, output: 0.008, reasoning: 0 },
};

export function estimateCost(
  tier: "pro" | "turbo" | string,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number,
): number {
  const p = PRICING[tier] ?? PRICING.default;
  const yuan =
    (inputTokens * p.input + outputTokens * p.output + reasoningTokens * p.reasoning) / 1000;
  return Math.round(yuan * 100000) / 100000; // 保留 5 位小数
}

// ---------------------------------------------------------------------------
// ai_runs 记账
// ---------------------------------------------------------------------------
export type RunStatus =
  | "pending"
  | "ok"
  | "schema_invalid"
  | "business_invalid"
  | "retried"
  | "degraded"
  | "dead_letter";

export interface RunRecord {
  userId?: string | null;
  taskType: string;
  model: string;
  tier?: "pro" | "turbo" | string;
  provider?: string;
  promptVersion?: number | null;
  status: RunStatus;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  sessionId?: string | null;
  latencyMs?: number | null;
  error?: string | null;
}

export async function recordRun(rec: RunRecord): Promise<number> {
  const provider = rec.provider ?? PROVIDER;
  const tier = rec.tier ?? "flash";
  const costEstimate = estimateCost(
    tier,
    rec.inputTokens,
    rec.outputTokens,
    rec.reasoningTokens,
  );
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO ai_runs
         (user_id, task_type, provider, model, prompt_version, status, retry_count,
          input_tokens, output_tokens, reasoning_tokens, cost_estimate, session_id,
          latency_ms, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        rec.userId ?? null,
        rec.taskType,
        provider,
        rec.model,
        rec.promptVersion ?? null,
        rec.status,
        rec.retryCount,
        rec.inputTokens,
        rec.outputTokens,
        rec.reasoningTokens,
        costEstimate,
        rec.sessionId ?? null,
        rec.latencyMs ?? null,
        rec.error ?? null,
      ],
    );
    return rows[0].id;
  } catch (err) {
    // 记账是旁路可观测性：DB 不可用不能阻断业务主流程
    console.warn(`[accounting] ai_runs 记账失败（已跳过）: ${(err as Error).message}`);
    return -1;
  }
}

// ---------------------------------------------------------------------------
// 成本护栏告警（记录不静默）
// ---------------------------------------------------------------------------
const LOCAL_ALERTS_FILE = path.join(process.cwd(), ".local-data", "cost_alerts.json");

export async function recordBudgetAlert(
  scope: string,
  level: "warn" | "degrade" | "block",
  usedYuan: number,
  limitYuan: number,
): Promise<void> {
  if (await isDbAvailable()) {
    try {
      await pool.query(
        `INSERT INTO cost_alerts (scope, level, used_yuan, limit_yuan)
         VALUES ($1,$2,$3,$4)`,
        [scope, level, usedYuan, limitYuan],
      );
      console.warn(`[cost-guard] 预算告警 scope=${scope} level=${level} used=${usedYuan} limit=${limitYuan}`);
      return;
    } catch (err) {
      console.warn(`[cost-guard] 告警落库失败（本地兜底）: ${(err as Error).message}`);
    }
  }
  // 本地兜底：写 JSON 文件
  try {
    await fs.mkdir(path.dirname(LOCAL_ALERTS_FILE), { recursive: true });
    let arr: unknown[] = [];
    try {
      arr = JSON.parse(await fs.readFile(LOCAL_ALERTS_FILE, "utf8"));
    } catch {
      arr = [];
    }
    arr.push({ scope, level, usedYuan, limitYuan, createdAt: new Date().toISOString() });
    await fs.writeFile(LOCAL_ALERTS_FILE, JSON.stringify(arr, null, 2), "utf8");
    console.warn(`[cost-guard] 预算告警(本地) scope=${scope} level=${level} used=${usedYuan} limit=${limitYuan}`);
  } catch (err) {
    console.warn(`[cost-guard] 本地告警写入失败: ${(err as Error).message}`);
  }
}

/**
 * 真实调用完成后，按实际花费评估各累计级预算的告警阈值。
 * 命中 alert_yuan 且近 60 分钟内同 scope 无告警 → 落一条 cost_alerts。
 */
export async function evaluateAlertsAfterRun(opts: {
  userId?: string | null;
  sessionId?: string | null;
  costYuan: number;
}): Promise<void> {
  const scopes = ["user_daily", "global"] as const;
  for (const scope of scopes) {
    try {
      const status = await computeScopeSpend(scope, opts);
      if (status.alertYuan == null) continue;
      if (status.usedYuan < status.alertYuan) continue;
      // 去重：60 分钟内同 scope 已有告警则跳过
      const recent = await recentAlertExists(scope);
      if (!recent) {
        await recordBudgetAlert(
          scope,
          status.action === "block" ? "block" : "warn",
          status.usedYuan,
          status.limitYuan,
        );
      }
    } catch (err) {
      console.warn(`[cost-guard] 评估 ${scope} 告警失败: ${(err as Error).message}`);
    }
  }
}

/** /api/health 与首页预算横幅使用 */
export interface BudgetStatus {
  dbConnected: boolean;
  userDaily?: { usedYuan: number; limitYuan: number; alertYuan: number | null };
  global?: { usedYuan: number; limitYuan: number; alertYuan: number | null };
  recentAlerts: { scope: string; level: string; usedYuan: number; createdAt: string }[];
}

export async function getBudgetStatus(userId?: string | null): Promise<BudgetStatus> {
  const dbOk = await isDbAvailable();
  if (!dbOk) {
    return { dbConnected: false, recentAlerts: await localRecentAlerts() };
  }
  try {
    const userDaily = await computeScopeSpend("user_daily", { userId });
    const global = await computeScopeSpend("global", { userId });
    const alerts = await recentAlertsList();
    return {
      dbConnected: true,
      userDaily: { usedYuan: userDaily.usedYuan, limitYuan: userDaily.limitYuan, alertYuan: userDaily.alertYuan },
      global: { usedYuan: global.usedYuan, limitYuan: global.limitYuan, alertYuan: global.alertYuan },
      recentAlerts: alerts,
    };
  } catch (err) {
    console.warn(`[cost-guard] 预算状态查询失败: ${(err as Error).message}`);
    return { dbConnected: false, recentAlerts: [] };
  }
}

// ---------------------------------------------------------------------------
// 预算检查核心
// ---------------------------------------------------------------------------
export interface BudgetDecision {
  allowed: boolean;
  action: "warn" | "degrade" | "block";
  scope: string;
  usedYuan: number;
  limitYuan: number;
  alertYuan: number | null;
}

async function loadBudgetConfig(scope: string): Promise<{
  limitYuan: number;
  alertYuan: number | null;
  action: "warn" | "degrade" | "block";
} | null> {
  const { rows } = await pool.query<{ limit_yuan: string; alert_yuan: string | null; action: string }>(
    `SELECT limit_yuan, alert_yuan, action FROM cost_budgets WHERE scope = $1`,
    [scope],
  );
  const cfg = rows[0];
  if (!cfg) return null;
  return {
    limitYuan: Number(cfg.limit_yuan),
    alertYuan: cfg.alert_yuan == null ? null : Number(cfg.alert_yuan),
    action: cfg.action as "warn" | "degrade" | "block",
  };
}

/** 计算某 scope 当前已花费（元） */
async function computeScopeSpend(
  scope: "request" | "session" | "user_daily" | "global",
  opts: { userId?: string | null; sessionId?: string | null; costYuan?: number },
): Promise<{ usedYuan: number; limitYuan: number; alertYuan: number | null; action: "warn" | "degrade" | "block" }> {
  const cfg = await loadBudgetConfig(scope);
  if (!cfg) return { usedYuan: (opts.costYuan ?? 0), limitYuan: 0, alertYuan: null, action: "warn" };

  if (scope === "request") {
    return { usedYuan: opts.costYuan ?? 0, limitYuan: cfg.limitYuan, alertYuan: cfg.alertYuan, action: cfg.action };
  }

  const since =
    scope === "global"
      ? `date_trunc('month', now())`
      : scope === "session"
        ? `now() - interval '24 hours'` // session 窗口按 24h 内累计
        : `date_trunc('day', now())`;

  let where = "";
  // 只 push 真正用到的参数，占位符从 $1 开始（global 分支无参数，避免
  // pg "bind message supplies 1 parameters, but prepared statement requires 0"）
  const params: unknown[] = [];
  if (scope === "global") {
    where = `1=1`;
  } else if (scope === "session") {
    where = `session_id = $1`;
    params.push(opts.sessionId ?? "");
  } else if (opts.userId == null) {
    // user_daily 在单用户应用 + 无 userId 调用（如 /api/health）下没意义，
    // 直接跳过本次（避免 $1=null 触发 pg "could not determine data type"）
    return { usedYuan: 0, limitYuan: cfg.limitYuan, alertYuan: cfg.alertYuan, action: cfg.action };
  } else {
    where = `user_id = $1`;
    params.push(opts.userId);
  }

  const sumRes = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_estimate), 0)::text AS total
     FROM ai_runs
     WHERE ${where} AND created_at >= ${since}`,
    params,
  );
  const usedYuan = Number(sumRes.rows[0]?.total ?? 0) + (opts.costYuan ?? 0);
  return { usedYuan, limitYuan: cfg.limitYuan, alertYuan: cfg.alertYuan, action: cfg.action };
}

export async function checkBudget(
  scope: "request" | "session" | "user_daily" | "global",
  opts: { userId?: string | null; sessionId?: string | null; costYuan: number },
): Promise<BudgetDecision> {
  try {
    return await checkBudgetInner(scope, opts);
  } catch (err) {
    // DB 不可用时护栏 fail-open（放行），避免预算组件故障阻断业务
    console.warn(`[accounting] 预算检查失败（fail-open）: ${(err as Error).message}`);
    const cfg = await safeLoadLimit(scope);
    return {
      allowed: true,
      action: cfg?.action ?? "warn",
      scope,
      usedYuan: opts.costYuan,
      limitYuan: cfg?.limitYuan ?? 0,
      alertYuan: cfg?.alertYuan ?? null,
    };
  }
}

async function checkBudgetInner(
  scope: "request" | "session" | "user_daily" | "global",
  opts: { userId?: string | null; sessionId?: string | null; costYuan: number },
): Promise<BudgetDecision> {
  const cfg = await loadBudgetConfig(scope);
  if (!cfg) {
    return { allowed: true, action: "warn", scope, usedYuan: opts.costYuan, limitYuan: 0, alertYuan: null };
  }
  const spend = await computeScopeSpend(scope, opts);
  return {
    allowed: spend.usedYuan <= spend.limitYuan,
    action: spend.action,
    scope,
    usedYuan: spend.usedYuan,
    limitYuan: spend.limitYuan,
    alertYuan: spend.alertYuan,
  };
}

async function safeLoadLimit(scope: string): Promise<{ limitYuan: number; alertYuan: number | null; action: "warn" | "degrade" | "block" } | null> {
  try {
    return await loadBudgetConfig(scope);
  } catch {
    return null;
  }
}

/** 组合护栏：依次检查 request → session → user_daily → global，任一 block 即拒绝 */
export async function checkAllBudgets(opts: {
  userId?: string | null;
  sessionId?: string | null;
  tier: "pro" | "turbo" | string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}): Promise<{ allowed: boolean; decision?: BudgetDecision }> {
  try {
    return await checkAllBudgetsInner(opts);
  } catch (err) {
    console.warn(`[accounting] 预算护栏整体失败（fail-open）: ${(err as Error).message}`);
    return { allowed: true };
  }
}

async function checkAllBudgetsInner(opts: {
  userId?: string | null;
  sessionId?: string | null;
  tier: "pro" | "turbo" | string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}): Promise<{ allowed: boolean; decision?: BudgetDecision }> {
  const costYuan = estimateCost(
    opts.tier,
    opts.inputTokens,
    opts.outputTokens,
    opts.reasoningTokens,
  );

  const checks: ("request" | "session" | "user_daily" | "global")[] = ["request"];
  if (opts.sessionId) checks.push("session");
  checks.push("user_daily", "global");

  for (const scope of checks) {
    const dec = await checkBudget(scope, {
      userId: opts.userId,
      sessionId: opts.sessionId,
      costYuan,
    });
    // block 直接拒绝；degrade/warn 放行（降级在调用方按 action 处理）
    if (!dec.allowed && dec.action === "block") {
      return { allowed: false, decision: dec };
    }
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// 本地告警读取（无 DB 时 /api/health 兜底）
// ---------------------------------------------------------------------------
async function localRecentAlerts(): Promise<{ scope: string; level: string; usedYuan: number; createdAt: string }[]> {
  try {
    const raw = await fs.readFile(LOCAL_ALERTS_FILE, "utf8");
    const arr = JSON.parse(raw) as { scope: string; level: string; usedYuan: number; createdAt: string }[];
    return arr.slice(-10).reverse();
  } catch {
    return [];
  }
}

async function recentAlertExists(scope: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM cost_alerts
       WHERE scope = $1 AND created_at >= now() - interval '60 minutes'`,
      [scope],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

async function recentAlertsList(): Promise<{ scope: string; level: string; usedYuan: number; createdAt: string }[]> {
  try {
    // created_at 用 ::text cast 让 pg 直接返回 string（pg-node 默认是 Date，会让 React 渲染炸）
    const { rows } = await pool.query<{ scope: string; level: string; used_yuan: number; created_at: string }>(
      `SELECT scope, level, used_yuan, created_at::text AS created_at FROM cost_alerts
       ORDER BY created_at DESC LIMIT 10`,
    );
    return rows.map((r) => ({
      scope: r.scope,
      level: r.level,
      usedYuan: Number(r.used_yuan),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
