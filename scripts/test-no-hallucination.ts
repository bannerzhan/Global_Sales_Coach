/**
 * 无 LLM 幻觉用户事实专项测试（对应 V0.1 DoD）。
 * 用虚构的"信息稀疏"用户跑 assessment + review，再用一个 LLM judge
 * 断言模型没有编造 prompt 里没给的用户事实（公司/行业/订单/金额/Incoterm 等）。
 *
 * 运行：node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/test-no-hallucination.ts
 */
import { z } from "zod";
import { runContract } from "../src/lib/llm/contract";
import { runAssessment } from "../src/lib/llm/assessment";
import { reviewSession } from "../src/lib/llm/review";
import type { Profile } from "../src/lib/repo/types";

const JUDGE_SCHEMA = z.object({
  hallucinated: z.boolean(),
  detail: z.string(),
});

/** judge：给定"用户已知事实"与"模型输出"，判断是否编造了未提供的事实 */
async function judge(knownFacts: string, modelOutput: string): Promise<{ hallucinated: boolean; detail: string }> {
  const res = await runContract<z.infer<typeof JUDGE_SCHEMA>>({
    taskType: "hallucination_judge",
    tier: "pro",
    toolName: "emit_judgement",
    toolDescription: "判断模型输出是否编造了未提供的用户事实",
    schema: JUDGE_SCHEMA,
    maxRetries: 1,
    maxTokens: 512,
    system:
      "你是严格的幻觉审查员。只判断一件事：模型输出是否编造了【用户已知事实】清单之外、且被当作既定事实陈述的用户相关信息（如具体公司名、行业、客户名、订单号、金额、产品名、Incoterms、支付条款等）。\n" +
      "注意区分：模型在场景中虚构【买家/客户角色】（这是演练内容，不算幻觉）；只有当模型把未提供的【用户侧事实】当作已知来引用或纠正时，才算 hallucinated=true。\n" +
      "输出 hallucinated（布尔）与 detail（一句话理由）。",
  },
  [
    {
      role: "user",
      content:
        `【用户已知事实（仅这些，其他均不应被当作已知）】\n${knownFacts}\n\n` +
        `【待审查的模型输出】\n${modelOutput}\n\n` +
        `请判断该输出是否编造了用户已知事实清单之外的事实。`,
    },
  ],
);
  if (res.ok && res.data) return { hallucinated: res.data.hallucinated, detail: res.data.detail };
  // judge 自身失败：保守判为"无法确认未幻觉"，测试失败以暴露问题
  return { hallucinated: true, detail: "judge 调用失败，无法确认无幻觉" };
}

function check(name: string, cond: boolean, detail: string) {
  const tag = cond ? "✅ PASS" : "❌ FAIL";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (name: string, cond: boolean, detail = "") => {
    if (check(name, cond, detail)) pass++;
    else fail++;
  };

  // 虚构的"信息极度稀疏"用户：除职位外一切未知
  const sparseProfile: Profile = {
    userId: "local",
    occupation: "外贸业务员",
    industry: null,
    markets: [],
    channels: [],
    dailyMinutes: 30,
    englishLevel: {},
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    updatedAt: new Date().toISOString(),
  };
  const KNOWN_FACTS =
    "职位：外贸业务员。\n行业：未提供。\n公司：未提供。\n目标市场：未提供。\n具体客户/订单/产品/金额：均未提供。\n（这是用于幻觉测试的虚构用户，模型不应把任何具体公司、行业、订单、产品当作已知事实。）";

  // ---- 测试 1：基线评估不编造用户事实 ----
  console.log("\n[1] 基线评估（稀疏用户）无幻觉");
  const assess = await runAssessment({
    profile: sparseProfile,
    selfRatings: { communication: 3, deal_advancement: 2, trust_building: 3 },
    userId: "local",
  });
  if (assess.ok && assess.data) {
    const out = JSON.stringify(assess.data);
    const j = await judge(KNOWN_FACTS, out);
    ok("assessment 未编造用户事实", !j.hallucinated, j.detail);
  } else {
    ok("assessment 未编造用户事实", false, "assessment 调用失败");
  }

  // ---- 测试 2：复盘不编造用户事实 ----
  console.log("\n[2] 演练复盘（稀疏上下文）无幻觉");
  const review = await reviewSession({
    scenarioTitle: "询盘回复演练",
    persona: { role: "采购经理", nationality: "美国", temperament: "理性" },
    objectives: ["communication.questioning"],
    turns: [
      { role: "ai_customer", content: "Hi, I saw your product online. Can you send me a quote?", pressureStep: 0, createdAt: new Date().toISOString() },
      { role: "user", content: "Sure, could you tell me your target quantity and market first?", pressureStep: 0, createdAt: new Date().toISOString() },
      { role: "ai_customer", content: "We need 500 units for the US market.", pressureStep: 0, createdAt: new Date().toISOString() },
    ],
    userId: "local",
  });
  if (review.ok && review.data) {
    const out = JSON.stringify(review.data);
    const j = await judge(KNOWN_FACTS, out);
    ok("review 未编造用户事实", !j.hallucinated, j.detail);
  } else {
    ok("review 未编造用户事实", false, "review 调用失败");
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("测试运行异常:", e);
  process.exit(1);
});
