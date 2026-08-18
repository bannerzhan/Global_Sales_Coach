import { z } from "zod";
import { chat, ProviderError, type ChatMessage, type ModelTier } from "./provider";
import {
  recordRun,
  checkAllBudgets,
  estimateCost,
  evaluateAlertsAfterRun,
  PROVIDER,
  type RunStatus,
} from "./accounting";

/**
 * 输出契约链（PRD P0）：
 *
 *   Function Calling 请求
 *     → Zod 结构化校验
 *     → 业务校验（自定义规则）
 *     → 失败 Retry（携带错误信息重试，最多 maxRetries 次）
 *     → 模板降级（fallback，status=degraded）
 *     → Dead-letter（status=dead_letter，抛 ContractError）
 *
 * 每次尝试自动落一条 ai_runs 记账，并前置成本护栏检查。
 * 调用方无需关心记账，只消费最终结果。
 */

// ---------------------------------------------------------------------------
// 契约定义
// ---------------------------------------------------------------------------
export interface ContractDefinition<T> {
  /** ai_runs.task_type，如 "lesson_plan" / "roleplay_eval" */
  taskType: string;
  /** 模型档位，默认 turbo */
  tier?: ModelTier;
  /** system prompt */
  system: string;
  /** Function Calling 工具名 */
  toolName: string;
  /** 工具描述（引导模型输出结构） */
  toolDescription: string;
  /** 输出结构（Zod） */
  schema: z.ZodType<T>;
  /** 业务校验：结构通过后再过一层业务规则 */
  businessValidate?: (data: T) => { ok: true } | { ok: false; error: string };
  /** 模板降级：重试耗尽时返回兜底数据；不提供则 dead-letter */
  fallback?: () => T | null;
  /** 最大重试次数（默认 2，即最多 3 次调用） */
  maxRetries?: number;
  /** prompt 版本号（prompt_versions 表引用） */
  promptVersion?: number;
  /** 用户 ID（记账用，可为空） */
  userId?: string | null;
  temperature?: number;
  /** 单次调用最大输出 token（也用于成本预检） */
  maxTokens?: number;
  /** 会话级预算追踪（roleplay session id） */
  sessionId?: string | null;
  /** 供应商标识（默认 volc-ark） */
  provider?: string;
}

export type ContractResult<T> =
  | { ok: true; data: T; runId: number; attempts: number; degraded: false }
  | { ok: false; reason: "degraded"; data: T | null; runId: number; attempts: number }
  | { ok: false; reason: "dead_letter"; runId: number; attempts: number };

// ---------------------------------------------------------------------------
// Zod → JSON Schema（OpenAI tools 参数格式）
// ---------------------------------------------------------------------------
function schemaToJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  // zod v4 内置 toJSONSchema
  const toJson = (z as unknown as { toJSONSchema?: (s: z.ZodType<T>) => unknown })
    .toJSONSchema;
  if (toJson) return toJson(schema) as Record<string, unknown>;
  // v3 兜底：结构化转换（仅支持本项目用到的子集）
  return zodV3Shallow(schema);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodV3Shallow(schema: any): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(schema.shape)) {
      properties[k] = zodV3Shallow(v);
      if (!(v instanceof z.ZodOptional) && !(v instanceof z.ZodDefault)) required.push(k);
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodV3Shallow(schema.element) };
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodV3Shallow(schema._def.innerType ?? schema._def.type);
  }
  if (schema instanceof z.ZodEnum) {
    // zod v4: options 数组；v3: _def.values
    const opts =
      (schema as unknown as { options?: readonly unknown[] }).options ??
      Object.values((schema._def as unknown as { values?: Record<string, unknown> }).values ?? {});
    return { type: "string", enum: opts.filter((v) => typeof v === "string") };
  }
  return {};
}

// ---------------------------------------------------------------------------
// 契约执行
// ---------------------------------------------------------------------------
export class ContractError extends Error {
  taskType: string;
  constructor(taskType: string, message: string) {
    super(message);
    this.name = "ContractError";
    this.taskType = taskType;
  }
}

interface AttemptOutcome<T> {
  status: RunStatus;
  error?: string;
}

export async function runContract<T>(
  def: ContractDefinition<T>,
  userMessages: ChatMessage[],
): Promise<ContractResult<T>> {
  const {
    taskType,
    tier = "turbo",
    system,
    toolName,
    toolDescription,
    schema,
    businessValidate,
    fallback,
    maxRetries = 2,
    promptVersion,
    userId,
    temperature,
    maxTokens = 4096,
    sessionId = null,
    provider,
  } = def;

  const attempts: AttemptOutcome<T>[] = [];
  const tools = [
    {
      type: "function" as const,
      function: {
        name: toolName,
        description: toolDescription,
        parameters: schemaToJsonSchema(schema),
      },
    },
  ];

  // ---- 重试循环：最多 maxRetries + 1 次 ----
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...userMessages,
    ];

    // 携带上次失败信息让模型纠错
    if (attempt > 0) {
      messages.push({
        role: "user",
        content:
          `你上一次的输出未通过校验，错误如下：\n${attempts[attempt - 1].error}\n` +
          `请修正后重新调用 ${toolName} 工具。`,
      });
    }

    try {
      // ---- 成本护栏预检（用输出上限估算，四级预算） ----
      const guard = await checkAllBudgets({
        userId,
        sessionId,
        tier,
        inputTokens: estimateInputTokens(userMessages),
        outputTokens: maxTokens,
        reasoningTokens: 0,
      });
      // block：直接拒绝（dead_letter）
      if (!guard.allowed && guard.decision?.action === "block") {
        const msg = `成本护栏拦截（${guard.decision.scope} 超限，block）`;
        attempts.push({ status: "dead_letter", error: msg });
        break;
      }
      // degrade：降级到 turbo 继续（不阻断业务）
      let effectiveTier: ModelTier = tier;
      if (!guard.allowed && guard.decision?.action === "degrade") {
        effectiveTier = "turbo";
        console.warn(`[contract] ${taskType} 预算降级为 turbo（${guard.decision.scope} 超限）`);
      }

      const resp = await chat({
        tier: effectiveTier,
        temperature,
        maxTokens,
        tools,
        // 实测：Ark 2.1 系列 tool_choice=required 返回空；auto 能稳定触发
        toolChoice: "auto",
        messages,
      });

      // 取 tool 调用参数（SDK v7：tool_calls 为 function/custom 联合类型，需类型守卫）
      const toolCall = resp.toolCalls?.[0];
      const fnCall =
        toolCall && toolCall.type === "function" ? toolCall.function : undefined;
      let rawArgs: unknown = null;
      let parseError: string | null = null;
      if (fnCall?.arguments) {
        try {
          rawArgs = JSON.parse(fnCall.arguments);
        } catch {
          parseError = "工具参数不是合法 JSON";
        }
      } else {
        parseError = "模型未调用工具";
      }

      // Zod 校验
      let parsed: T | null = null;
      if (parseError === null) {
        const r = schema.safeParse(rawArgs);
        if (r.success) parsed = r.data;
        else {
          parseError = `结构校验失败: ${r.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 3)
            .join("; ")}`;
        }
      }

      // 业务校验
      let bizError: string | null = null;
      if (parsed !== null && businessValidate) {
        const biz = businessValidate(parsed);
        if (!biz.ok) bizError = `业务校验失败: ${biz.error}`;
      }

      if (parsed !== null && bizError === null) {
        // 成功
        const runId = await recordRun({
          userId,
          taskType,
          model: resp.model,
          tier: effectiveTier,
          provider: provider ?? PROVIDER,
          promptVersion,
          status: attempt === 0 ? "ok" : "retried",
          retryCount: attempt,
          inputTokens: resp.usage.inputTokens,
          outputTokens: resp.usage.outputTokens,
          reasoningTokens: resp.usage.reasoningTokens,
          sessionId,
          latencyMs: resp.latencyMs,
        });
        // 跑后按实际花费评估各累计级预算告警（记录不静默）
        void evaluateAlertsAfterRun({
          userId,
          sessionId,
          costYuan: estimateCost(
            effectiveTier,
            resp.usage.inputTokens,
            resp.usage.outputTokens,
            resp.usage.reasoningTokens,
          ),
        });
        return { ok: true, data: parsed, runId, attempts: attempt + 1, degraded: false };
      }

      const errMsg = parseError ?? bizError ?? "未知校验失败";
      console.warn(`[contract] ${taskType} 第 ${attempt + 1} 次尝试失败: ${errMsg}`);
      attempts.push({
        status: "retried",
        error: errMsg,
      });
      // 循环继续重试
    } catch (err) {
      const isProvider = err instanceof ProviderError;
      const retryable = isProvider ? err.retryable : false;
      attempts.push({
        status: "retried",
        error: err instanceof Error ? err.message : String(err),
      });
      if (!retryable) {
        // 非可重试错误直接终止（如鉴权失败）
        break;
      }
      if (attempt === maxRetries) break;
    }
  }

  // ---- 重试耗尽：降级 or dead-letter ----
  const lastAttempt = attempts[attempts.length - 1];
  const failError = lastAttempt?.error ?? "未知失败";

  if (fallback) {
    const fallbackData = fallback();
    const runId = await recordRun({
      userId,
      taskType,
      model: "template",
      tier,
      provider: provider ?? PROVIDER,
      promptVersion,
      status: "degraded",
      retryCount: attempts.length,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      sessionId,
      latencyMs: null,
      error: failError,
    });
    return {
      ok: false,
      reason: "degraded",
      data: fallbackData,
      runId,
      attempts: attempts.length,
    };
  }

  const runId = await recordRun({
    userId,
    taskType,
    model: "dead_letter",
    tier,
    provider: provider ?? PROVIDER,
    promptVersion,
    status: "dead_letter",
    retryCount: attempts.length,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    sessionId,
    latencyMs: null,
    error: failError,
  });
  throw new ContractError(taskType, failError);
}

/** 粗略估算输入 token（中文按 1 字 ≈ 1 token 近似） */
function estimateInputTokens(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + (m.content?.length ?? 0) + 16, 0);
}
