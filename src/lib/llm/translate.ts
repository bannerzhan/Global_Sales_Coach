import { z } from "zod";
import { runContract } from "./contract";

/**
 * 翻译调用（复用输出契约链，记 ai_runs 成本账本）。
 * 方向自动识别：输入含 CJK → 中译英；否则 → 英译中。
 * 走 flash 档，token 成本低、延迟小，适合高频小调用。
 */

export type TranslateDirection = "zh->en" | "en->zh";

const TranslateSchema = z.object({
  translation: z.string().min(1, "翻译结果不能为空"),
});

export function detectDirection(text: string): TranslateDirection {
  // 覆盖 CJK 基本区（U+4E00–U+9FFF）与扩展 A（U+3400–U+4DBF）
  const hasCJK = /[一-鿿㐀-䶿]/.test(text);
  return hasCJK ? "zh->en" : "en->zh";
}


export type TranslateResult =
  | { ok: true; translation: string; direction: TranslateDirection }
  | { ok: false; error: string };

/**
 * 翻译一段文本。失败（重试耗尽 / dead_letter / 异常）统一返回 ok:false，
 * 不抛错，由调用方决定 UX（按钮复原 + 重试提示）。
 */
export async function translateText(
  text: string,
  userId?: string | null,
): Promise<TranslateResult> {
  const direction = detectDirection(text);
  const source = direction === "zh->en" ? "Chinese" : "English";
  const target = direction === "zh->en" ? "English" : "Chinese";

  try {
    const res = await runContract(
      {
        taskType: "translate",
        tier: "flash",
        system:
          "You are a professional bilingual translator for international sales conversations. " +
          "Translate naturally and faithfully, preserving tone, politeness and business meaning. " +
          "You MUST respond by calling the emit_translation tool with the translated text as its argument. " +
          "Never output the translation as plain text, and never add explanations, quotes or markdown.",
        toolName: "emit_translation",
        toolDescription: "Return the translated text.",
        schema: TranslateSchema,
        userId,
        maxTokens: 1024,
        temperature: 0.3,
      },
      [
        {
          role: "user",
          content:
            `Translate the following ${source} text into natural ${target}.\n\n` +
            `<text>\n${text}\n</text>`,
        },
      ],
    );

    if (!res.ok || !res.data?.translation) {
      return { ok: false, error: "翻译失败，请稍后重试" };
    }
    return {
      ok: true,
      translation: res.data.translation.trim(),
      direction,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "翻译失败，请稍后重试" };
  }
}
