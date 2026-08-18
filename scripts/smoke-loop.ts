/**
 * Step 6 冒烟测试：学习闭环全链路（真实 ARK 调用）。
 * 场景生成 → 角色扮演多轮 → 复盘 → 技能状态更新。
 * 用法: node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/smoke-loop.ts
 */
import { generateScenario } from "../src/lib/llm/scenario-gen";
import { customerReply } from "../src/lib/llm/roleplay-reply";
import { reviewSession } from "../src/lib/llm/review";
import { createScenario, getScenario } from "../src/lib/repo/scenario";
import {
  createRoleplaySession,
  appendTurn,
  getRoleplaySession,
  completeSession,
} from "../src/lib/repo/attempt";
import { applySkillUpdates, listSkillStates } from "../src/lib/repo/skill-state";
import type { Profile, RoleplayTurn } from "../src/lib/repo/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}`);
  }
}

const profile: Profile = {
  userId: "smoke",
  occupation: "外贸业务员",
  industry: "促销礼品",
  markets: ["US"],
  channels: ["email"],
  dailyMinutes: 30,
  englishLevel: { speaking: 3, listening: 3 },
  locale: "zh-CN",
  timezone: "Asia/Shanghai",
  updatedAt: new Date().toISOString(),
};

const USER_LINES = [
  "你好，我是 XX 公司的销售，看到贵司对我们的促销礼品目录感兴趣，想先了解一下您的具体需求。",
  "我们这款杯子支持定制 LOGO，材质是食品级不锈钢，在美区有很多成功案例，可以给您参考数据。",
  "价格方面我们的确不是最低的，但考虑到定制能力、交期稳定性这些，综合成本其实更划算，您看呢？",
];

async function main() {
  console.log("\n[1/5] 场景生成（真实 LLM）");
  const gen = await generateScenario({
    goalTitle: "掌握美区客户的异议处理与价格谈判",
    profile,
  });
  check("场景生成 ok", gen.ok === true);
  check("有标题", (gen.data?.title?.length ?? 0) >= 4);
  check("有目标技能", (gen.data?.objectives?.length ?? 0) >= 1);
  check("压力序列 >= 2", (gen.data?.pressureSequence?.length ?? 0) >= 2);
  check("有开场白", (gen.data?.openingLine?.length ?? 0) >= 4);
  console.log("    场景:", gen.data?.title);
  console.log("    开场:", gen.data?.openingLine);

  console.log("\n[2/5] 场景入库 + 开演练");
  const scenario = await createScenario({
    title: gen.data!.title,
    category: gen.data!.category,
    difficulty: gen.data!.difficulty,
    persona: gen.data!.persona,
    objectives: gen.data!.objectives,
    pressureSequence: gen.data!.pressureSequence,
    workContextSeed: null,
    openingLine: gen.data!.openingLine,
  });
  const openingTurn: RoleplayTurn = {
    role: "ai_customer",
    content: scenario.openingLine,
    pressureStep: 0,
    createdAt: new Date().toISOString(),
  };
  const session = await createRoleplaySession(scenario.id, openingTurn);
  check("会话已创建", Boolean(session.id));
  check("场景可读回", (await getScenario(scenario.id))?.id === scenario.id);

  console.log("\n[3/5] 多轮角色扮演（用户 → AI 客户）");
  let lastAiReply = "";
  for (let i = 0; i < USER_LINES.length; i++) {
    const userTurn: RoleplayTurn = {
      role: "user",
      content: USER_LINES[i],
      pressureStep: 0,
      createdAt: new Date().toISOString(),
    };
    await appendTurn(session.id, userTurn);
    const cur = (await getRoleplaySession(session.id))!;
    const reply = await customerReply({
      scenario,
      turns: cur.turns,
      latestUserMessage: USER_LINES[i],
    });
    check(`第 ${i + 1} 轮 AI 回复`, reply.ok === true && (reply.reply?.length ?? 0) >= 4);
    if (reply.ok && reply.reply) {
      lastAiReply = reply.reply;
      const aiTurn: RoleplayTurn = {
        role: "ai_customer",
        content: reply.reply,
        pressureStep: reply.pressureStep,
        createdAt: new Date().toISOString(),
      };
      await appendTurn(session.id, aiTurn);
    }
  }
  const final = (await getRoleplaySession(session.id))!;
  check("会话共 7 轮（1 开场 + 3×2）", final.turns.length === 1 + USER_LINES.length * 2);
  check("AI 回复非空", lastAiReply.length > 0);
  console.log("    最后一条 AI:", lastAiReply.slice(0, 40) + "…");

  console.log("\n[4/5] 复盘（真实 LLM pro）");
  const completed = await completeSession(session.id);
  check("会话标记完成", completed?.status === "completed");
  const review = await reviewSession({
    scenarioTitle: scenario.title,
    persona: scenario.persona,
    objectives: scenario.objectives,
    turns: completed!.turns,
  });
  check("复盘 ok", review.ok === true);
  check("总分 0-10", review.data ? review.data.score >= 0 && review.data.score <= 10 : false);
  check("三维度分齐", review.data?.dimensionScores.length === 3);
  check("有亮点", (review.data?.highlights.length ?? 0) >= 1);
  check("有改进", (review.data?.improvements.length ?? 0) >= 1);
  check("有技能更新", (review.data?.skillUpdates.length ?? 0) >= 1);
  console.log("    总分:", review.data?.score, "| 改进:", review.data?.improvements[0]);

  console.log("\n[5/5] 技能状态更新");
  await applySkillUpdates(review.data!.skillUpdates);
  const states = await listSkillStates();
  check("技能状态已记录", states.length >= 1);
  const top = states[0];
  check("掌握度在 0-1", top ? top.mastery >= 0 && top.mastery <= 1 : false);
  check("有复习计划", Boolean(top?.nextReview));
  console.log(`    最高掌握: ${top?.skillId} = ${(top?.mastery ?? 0).toFixed(2)}`);

  console.log("\n[6/6] 专项演练场景生成（focusSkillId）");
  const focusGen = await generateScenario({
    goalTitle: "提升外贸销售沟通与成交能力",
    profile,
    focusSkillId: "deal_advancement.price_objection",
  });
  check("专项场景生成 ok", focusGen.ok === true);
  check(
    "objectives 含聚焦技能",
    focusGen.data?.objectives?.includes("deal_advancement.price_objection") ?? false,
  );
  console.log("    专项场景:", focusGen.data?.title, "| objectives:", focusGen.data?.objectives?.join(","));

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("冒烟测试异常:", e);
  process.exit(1);
});
