/**
 * 练习语言工具。
 * 本产品专注英文销售训练，所有 AI 生成内容（场景 / AI 客户 / 复盘 / 评估 / 目标建议）固定为英文。
 * 应用外壳（菜单/按钮）当前仍显示中文。
 */

export type Lang = "zh" | "en";

/** 统一固定为英文，忽略历史 profile/scenario 中可能残留的 locale 值 */
export function langOf(_locale?: string | null): Lang {
  return "en";
}

/** 统一的「输出语言」指令行，注入各 prompt 末尾 */
export function outputLangLine(lang: Lang): string {
  return lang === "en"
    ? "Output ALL content (titles, highlights, improvements, feedback, comments, summaries) in English."
    : "全部用中文输出（标题、亮点、改进、反馈、点评、总评都用中文）。";
}

/** 语言自述片段（用于场景/客户/复盘的角色说明里点明对话语言） */
export function conversationLangNote(lang: Lang): string {
  return lang === "en"
    ? "The conversation is entirely in English (you may use trade terms like FOB / MOQ / L/C)."
    : "对话用中文，可夹带英文商务词汇（如 FOB / MOQ / L/C）。";
}
