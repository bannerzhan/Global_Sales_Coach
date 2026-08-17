import OpenAI from "openai";
import { env } from "../env";

/**
 * 火山方舟 LLM Provider（OpenAI 兼容协议封装）。
 *
 * 模型档位：
 *  - pro    → 复杂推理任务（学习路径规划、评估、纠错分析）
 *  - turbo  → 高频轻任务（对话、角色扮演生成、即时反馈）
 *
 * 接入点（ep-）优先，未配置时回退模型 ID。
 * 2.1 系列思考模型会返回 reasoning_content，需透传给记账层。
 */

export type ModelTier = "pro" | "turbo";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** assistant 消息附带的 tool_calls（重试时透传） */
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"];
  /** tool 消息的调用 id */
  tool_call_id?: string;
  /** 思考模型产出的推理内容，透传用 */
  reasoning_content?: string | null;
}

export interface ChatOptions {
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  /** Function Calling 工具定义 */
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  toolChoice?: "auto" | "none" | "required";
  /** 结构化输出（JSON mode 用 response_format） */
  jsonMode?: boolean;
  /** 重试透传的上一次失败信息（用于纠错） */
  retryHint?: string | null;
}

export interface ChatResult {
  content: string | null;
  reasoningContent: string | null;
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessage["tool_calls"] | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
  model: string;
  latencyMs: number;
}

/** 全局单例客户端（避免热重载重复建实例） */
const globalForArk = globalThis as unknown as {
  __gscArk?: OpenAI;
};

export function getClient(): OpenAI {
  if (!globalForArk.__gscArk) {
    globalForArk.__gscArk = new OpenAI({
      baseURL: env.ARK_BASE_URL,
      apiKey: env.ARK_API_KEY,
      timeout: 120_000,
      maxRetries: 1, // 网络层重试交给本层控制，避免 SDK 静默重试
    });
  }
  return globalForArk.__gscArk;
}

/** 按档位解析实际模型标识 */
export function resolveModel(tier: ModelTier): string {
  if (tier === "pro") {
    return env.ARK_ENDPOINT_PRO || env.ARK_MODEL_PRO || "doubao-seed-2.1-pro-260628";
  }
  return env.ARK_ENDPOINT_TURBO || env.ARK_MODEL_TURBO || "doubao-seed-2.1-turbo-260628";
}

/**
 * 核心对话入口。
 * 返回规范化结果，token 与耗时统计齐全，供记账层消费。
 */
export async function chat(options: ChatOptions & { messages: ChatMessage[] }): Promise<ChatResult> {
  const tier = options.tier ?? "turbo";
  const model = resolveModel(tier);
  const startedAt = Date.now();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = options.messages.map(
    (m) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content ?? "", tool_call_id: m.tool_call_id! };
      }
      if (m.role === "assistant") {
        const base: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: m.content,
        };
        if (m.tool_calls?.length) base.tool_calls = m.tool_calls;
        if (m.reasoning_content) {
          // 思考模型重试时透传推理内容，保持上下文一致
          (base as unknown as Record<string, unknown>).reasoning_content =
            m.reasoning_content;
        }
        return base;
      }
      return { role: m.role, content: m.content ?? "" };
    },
  );

  const body: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const resp = await getClient().chat.completions.create(body);
    const msg = resp.choices[0]?.message;
    const usage = resp.usage;

    // 思考模型：reasoning_content 在 message 顶层或 usage 明细里
    const reasoningContent =
      (msg as unknown as { reasoning_content?: string | null }).reasoning_content ?? null;
    const reasoningTokens =
      (usage as unknown as { reasoning_tokens?: number }).reasoning_tokens ?? 0;

    return {
      content: msg?.content ?? null,
      reasoningContent,
      toolCalls: msg?.tool_calls ?? null,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        reasoningTokens,
      },
      model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // 幂等：超时/网络错误标记为可重试
    const retryable =
      errMsg.includes("timeout") ||
      errMsg.includes("ECONNRESET") ||
      errMsg.includes("ETIMEDOUT") ||
      errMsg.includes("429") ||
      errMsg.includes("502") ||
      errMsg.includes("503");
    throw new ProviderError(errMsg, { retryable, tier, model });
  }
}

export class ProviderError extends Error {
  retryable: boolean;
  tier: ModelTier;
  model: string;
  constructor(
    message: string,
    info: { retryable: boolean; tier: ModelTier; model: string },
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryable = info.retryable;
    this.tier = info.tier;
    this.model = info.model;
  }
}
