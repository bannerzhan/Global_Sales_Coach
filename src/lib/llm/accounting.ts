import { pool } from "../db";

/**
 * AI 调用记账 + 成本护栏（对应 ai_runs / cost_budgets 表）。
 *
 * 记账：每次 LLM 调用落一条 ai_runs，含 token 明细与最终状态。
 * 护栏：四级预算（request / session / user_daily / global），
 * 超限行为 warn（告警继续） / degrade（降级用 turbo） / block（拒绝调用）。
 *
 * ⚠️ 定价常量为估算值，部署前必须按火山方舟官网实际计价校准。
 */

// ---------------------------------------------------------------------------
// 定价（元 / 千 token）—— 估算，TODO: 上线前按官网校准
// ---------------------------------------------------------------------------
const PRICING: Record<string, { input: number; output: number; reasoning: number }> = {
  // pro 档（doubao-seed-2.1-pro 系列，含思考）
  pro: { input: 0.002, output: 0.008, reasoning: 0.002 },
  // turbo 档（doubao-seed-2.1-turbo 系列）
  turbo: { input: 0.001, output: 0.004, reasoning: 0 },
  // 兜底
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
  promptVersion?: number | null;
  status: RunStatus;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs?: number | null;
  error?: string | null;
}

export async function recordRun(rec: RunRecord): Promise<number> {
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO ai_runs
         (user_id, task_type, model, prompt_version, status, retry_count,
          input_tokens, output_tokens, reasoning_tokens, latency_ms, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        rec.userId ?? null,
        rec.taskType,
        rec.model,
        rec.promptVersion ?? null,
        rec.status,
        rec.retryCount,
        rec.inputTokens,
        rec.outputTokens,
        rec.reasoningTokens,
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
// 成本护栏
// ---------------------------------------------------------------------------
export interface BudgetDecision {
  allowed: boolean;
  action: "warn" | "degrade" | "block";
  scope: string;
  usedYuan: number;
  limitYuan: number;
}

/**
 * 检查预算是否允许本次调用。
 * scope: request / user_daily / global（session 待会话表就绪后接入）
 */
export async function checkBudget(
  scope: "request" | "session" | "user_daily" | "global",
  opts: { userId?: string | null; costYuan: number },
): Promise<BudgetDecision> {
  try {
    return await checkBudgetInner(scope, opts);
  } catch (err) {
    // DB 不可用时护栏 fail-open（放行），避免预算组件故障阻断业务
    console.warn(`[accounting] 预算检查失败（fail-open）: ${(err as Error).message}`);
    return { allowed: true, action: "warn", scope, usedYuan: 0, limitYuan: 0 };
  }
}

async function checkBudgetInner(
  scope: "request" | "session" | "user_daily" | "global",
  opts: { userId?: string | null; costYuan: number },
): Promise<BudgetDecision> {
  // 读取预算配置
  const { rows } = await pool.query<{ scope: string; limit_yuan: string; action: string }>(
    `SELECT scope, limit_yuan, action FROM cost_budgets WHERE scope = $1`,
    [scope],
  );
  const cfg = rows[0];
  if (!cfg) return { allowed: true, action: "warn", scope, usedYuan: 0, limitYuan: 0 };

  const limitYuan = Number(cfg.limit_yuan);
  const action = cfg.action as BudgetDecision["action"];

  // 单次请求：直接比较本次估算成本
  if (scope === "request") {
    return {
      allowed: opts.costYuan <= limitYuan,
      action,
      scope,
      usedYuan: opts.costYuan,
      limitYuan,
    };
  }

  // user_daily / global：累计已花费 + 本次
  const since =
    scope === "global"
      ? `date_trunc('month', now())`
      : `date_trunc('day', now())`;

  const where = scope === "global" ? `1=1` : `user_id = $1`;
  const params = scope === "global" ? [scope] : [opts.userId ?? null, scope];

  const sumRes = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(
        (input_tokens * 0.002 + output_tokens * 0.008 + reasoning_tokens * 0.002) / 1000
      ), 0)::text AS total
     FROM ai_runs
     WHERE ${where} AND created_at >= ${since}`,
    params,
  );
  const usedYuan = Number(sumRes.rows[0]?.total ?? 0) + opts.costYuan;

  return {
    allowed: usedYuan <= limitYuan,
    action,
    scope,
    usedYuan,
    limitYuan,
  };
}

/** 组合护栏：依次检查 request → user_daily → global，任一 block 即拒绝 */
export async function checkAllBudgets(opts: {
  userId?: string | null;
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

  const req = await checkBudget("request", { userId: opts.userId, costYuan });
  if (!req.allowed) return { allowed: false, decision: req };

  const daily = await checkBudget("user_daily", { userId: opts.userId, costYuan });
  if (!daily.allowed) return { allowed: false, decision: daily };

  const global = await checkBudget("global", { userId: opts.userId, costYuan });
  if (!global.allowed) return { allowed: false, decision: global };

  return { allowed: true };
}
