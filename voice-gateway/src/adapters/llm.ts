/**
 * LLM 适配器：方舟 Ark（OpenAI 兼容 chat completions，流式）。
 *
 * 销售教练的业务 prompt（客户人设 / 销售目标 / 对话阶段 / 复盘要求）在调用方
 * 组装好 system prompt 后传入，这里只负责流式转发 + 降级。
 *
 * ⚠️ 无 ARK_API_KEY 时降级：把用户文本原样回显（前面加「[降级]」），让三段链路
 *    在无 key 阶段也能端到端跑通。
 */

const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ENDPOINT = process.env.ARK_ENDPOINT_FLASH || "ep-20260819092418-hgbsw";
const MODEL = process.env.ARK_MODEL_FLASH || "deepseek-v4-flash";

export interface LlmHandlers {
  onDelta: (text: string) => void;
  onDone: (full: string) => void;
  onError: (err: string) => void;
}

export async function streamLlm(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  handlers: LlmHandlers,
): Promise<void> {
  if (!apiKey) {
    const echoed = `[降级] 未配置 ARK_API_KEY，LLM 回显: ${userText}`;
    handlers.onDelta(echoed);
    handlers.onDone(echoed);
    return;
  }
  try {
    const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ENDPOINT.startsWith("ep-") ? ENDPOINT : MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      handlers.onError?.(`LLM HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            handlers.onDelta(delta);
          }
        } catch {
          /* 跳过不完整帧 */
        }
      }
    }
    handlers.onDone(full);
  } catch (e) {
    handlers.onError?.((e as Error).message);
  }
}
