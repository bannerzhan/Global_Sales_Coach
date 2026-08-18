import { z } from "zod";
import { runContract } from "./contract";
import type { Profile } from "../repo/types";
import { SKILLS, skillById } from "../repo/skills";

/**
 * 演练场景生成（Scenario Generator）。
 * 基于 学习目标 + 用户画像 → 生成贴近真实工作的销售演练场景
 * （买家画像、练习目标技能、压力递进序列、AI 客户开场白）。
 * 走输出契约链，失败模板降级。
 */

export const ScenarioGenSchema = z.object({
  title: z.string().min(4).max(60, "场景标题 4-60 字"),
  category: z.enum(["inquiry", "quotation", "negotiation", "complaint", "followup", "closing"]),
  difficulty: z.number().int().min(1).max(5),
  persona: z.object({
    role: z.string().min(2, "买家角色至少 2 字"),
    nationality: z.string().min(1),
    temperament: z.string().min(2, "性格特点至少 2 字"),
    companySize: z.string().optional(),
    budget: z.string().optional(),
  }),
  objectives: z.array(z.string()).min(1, "至少 1 个练习目标技能").max(3),
  pressureSequence: z.array(z.string()).min(2, "至少 2 个压力步骤").max(5),
  openingLine: z.string().min(4, "开场白至少 4 字"),
});
export type ScenarioGenResult = z.infer<typeof ScenarioGenSchema>;

export interface ScenarioGenInput {
  goalTitle: string;
  profile: Profile;
  userId?: string | null;
  /** 专项演练：聚焦某一技能，objectives 必须包含且围绕它设计场景 */
  focusSkillId?: string | null;
}

const FALLBACK_OPENING = "您好，我在网上看到贵公司的产品目录，想了解一下报价。";

export async function generateScenario({
  goalTitle,
  profile,
  userId,
  focusSkillId,
}: ScenarioGenInput): Promise<{ ok: boolean; data?: ScenarioGenResult; degraded?: boolean }> {
  const skillList = SKILLS.map((s) => `${s.id}（${s.name}）`).join("、");
  const focusDef = focusSkillId ? skillById(focusSkillId) : undefined;
  const focusInstruction = focusDef
    ? `\n【专项聚焦】本次演练必须重点围绕技能「${focusDef.name}」（id=${focusDef.id}）展开。` +
      `要求：objectives 的第一个技能 id 必须是 ${focusDef.id}，场景的施压点、客户异议都应直接命中该技能的薄弱/练习点，` +
      `例如该技能是「价格异议」就让客户反复压价，是「需求挖掘」就让客户含糊其辞逼你追问。不要偏离这个技能。\n`
    : "";
  const result = await runContract<ScenarioGenResult>(
    {
      taskType: "generate_scenario",
      tier: "turbo",
      toolName: "emit_scenario",
      toolDescription: "根据学习目标和用户画像生成一个销售演练场景",
      schema: ScenarioGenSchema,
      maxRetries: 1,
      maxTokens: 1536,
      userId,
      fallback: () => ({
        title: `${goalTitle.slice(0, 20)}——客户询价演练`,
        category: "inquiry",
        difficulty: 3,
        persona: {
          role: "采购经理",
          nationality: profile.markets[0] || "美国",
          temperament: "务实、直接",
          companySize: "中型企业",
          budget: "预算有限",
        },
        objectives: ["communication.questioning", "deal_advancement.price_objection"],
        pressureSequence: ["客户先问价格", "客户质疑报价过高", "客户要求降价才考虑下单"],
        openingLine: FALLBACK_OPENING,
      }),
      system:
        "你是 Global Sales Coach 的场景设计师，负责把用户的学习目标转成一次贴近真实工作的销售演练。\n" +
        "要求：\n" +
        "1. 场景必须能锻炼到 objectives 里的目标技能，压力逐步升级\n" +
        "2. persona 的 nationality 应从用户的目标市场里选，temperament 要具体（影响 AI 扮演语气）\n" +
        "3. pressureSequence 是 2-5 个递进的客户施压动作（如先问价、再压价、最后逼单）\n" +
        "4. objectives 从以下技能池里选 1-3 个，输出技能 id：\n" +
        `   ${skillList}\n` +
        "5. openingLine 是 AI 客户的第一句话，用中文、口语化、贴近真实询盘" + focusInstruction,
    },
    [
      {
        role: "user",
        content:
          `学习目标：${goalTitle}\n` +
          `用户画像：${profile.occupation ?? "销售"}，行业${profile.industry ?? "未知"}，` +
          `目标市场 ${profile.markets.join("/") || "未知"}，渠道 ${profile.channels.join("/") || "未知"}，` +
          `英语水平（1-5）听说读写 ${profile.englishLevel.speaking ?? "-"}/${profile.englishLevel.listening ?? "-"}` +
          `/${profile.englishLevel.reading ?? "-"}/${profile.englishLevel.writing ?? "-"}\n` +
          `请生成一个中文演练场景。` +
          (focusDef
            ? `\n本次聚焦练习技能「${focusDef.name}」（id=${focusDef.id}）。`
            : ""),
      },
    ],
  );

  if (result.ok) return { ok: true, data: result.data };
  if (result.reason === "degraded" && result.data) {
    return { ok: true, data: result.data, degraded: true };
  }
  return { ok: false };
}
