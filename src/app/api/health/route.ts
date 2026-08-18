import { NextResponse } from "next/server";
import { isDbAvailable } from "@/lib/repo/storage";
import { getBudgetStatus } from "@/lib/llm/accounting";
import { env } from "@/lib/env";

/**
 * 健康检查：返回 DB 连通性、LLM 配置完整性、成本护栏预算状态。
 * 不触发任何 LLM 调用（保持零成本）。
 */
export async function GET() {
  const dbOk = await isDbAvailable();
  const budget = await getBudgetStatus();

  const llmConfigured = Boolean(env.ARK_API_KEY && (env.ARK_ENDPOINT_PRO || env.ARK_MODEL_PRO));

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    db: dbOk ? "connected" : "local-fallback",
    llm: {
      configured: llmConfigured,
      baseUrl: env.ARK_BASE_URL,
      pro: env.ARK_ENDPOINT_PRO || env.ARK_MODEL_PRO || null,
      turbo: env.ARK_ENDPOINT_TURBO || env.ARK_MODEL_TURBO || null,
    },
    budget: {
      dbConnected: budget.dbConnected,
      userDaily: budget.userDaily ?? null,
      global: budget.global ?? null,
      recentAlerts: budget.recentAlerts,
    },
  });
}
