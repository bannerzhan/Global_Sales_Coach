/**
 * 冒烟测试：LLM Provider + 输出契约链（真实调用火山方舟）。
 *
 * 用法：
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/smoke.ts
 *
 * 不依赖数据库（记账 fail-open）。
 */
import { z } from "zod";
import { chat, resolveModel, type ChatMessage } from "../src/lib/llm/provider";
import { runContract } from "../src/lib/llm/contract";
import { estimateCost } from "../src/lib/llm/accounting";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra ?? ""}`);
  }
}

async function main() {
  console.log(`\n=== 1. Provider: turbo 基础对话 ===`);
  {
    const r = await chat({
      tier: "turbo",
      temperature: 0.3,
      messages: [{ role: "user", content: "只回答两个字：你好" }],
    });
    console.log(`  模型: ${r.model}`);
    console.log(`  回复: ${r.content}`);
    console.log(`  tokens: in=${r.usage.inputTokens} out=${r.usage.outputTokens}`);
    check("turbo 对话成功", !!r.content);
    check("usage 有 token 统计", r.usage.inputTokens > 0 && r.usage.outputTokens > 0);
    console.log(`  估算成本: ¥${estimateCost("turbo", r.usage.inputTokens, r.usage.outputTokens, 0)}`);
  }

  console.log(`\n=== 2. Provider: pro 思考模型（reasoning_content） ===`);
  {
    const r = await chat({
      tier: "pro",
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content:
            "用户刚完成一个销售演练，表现：开场白流畅、需求挖掘只问了2个问题、报价环节卡壳。请用不超过80字点评并给出一个改进点。",
        },
      ],
    });
    console.log(`  模型: ${r.model}`);
    console.log(`  reasoningTokens: ${r.usage.reasoningTokens}`);
    console.log(`  思考内容片段: ${(r.reasoningContent ?? "").slice(0, 60)}`);
    console.log(`  回复: ${(r.content ?? "").slice(0, 100)}`);
    check("pro 对话成功", !!r.content);
    check("思考模型返回 reasoning 字段", r.reasoningContent !== null || r.usage.reasoningTokens > 0);
  }

  console.log(`\n=== 3. Contract: Function Calling 成功路径 ===`);
  {
    const planSchema = z.object({
      title: z.string().min(2),
      focus: z.string().min(2),
      steps: z
        .array(
          z.object({
            order: z.number().int().min(1),
            activity: z.string().min(2),
            minutes: z.number().int().min(1).max(60),
          }),
        )
        .min(2),
    });

    const r = await runContract(
      {
        taskType: "lesson_plan",
        tier: "turbo",
        system:
          "你是销售教练。根据用户描述生成一份 15-20 分钟的刻意练习计划。\n" +
          "硬性要求：必须调用 emit_lesson_plan 工具输出完整参数（title/focus/steps），不要输出任何文本回复。",
        toolName: "emit_lesson_plan",
        toolDescription: "输出学习计划结构",
        schema: planSchema,
        businessValidate: (d) =>
          d.steps.length >= 2 && d.steps.length <= 5
            ? { ok: true }
            : { ok: false, error: "练习步骤必须在 2-5 步之间" },
        fallback: () => ({
          title: "模板降级计划",
          focus: "基础话术复述",
          steps: [
            { order: 1, activity: "朗读标准话术", minutes: 5 },
            { order: 2, activity: "角色扮演练习", minutes: 10 },
          ],
        }),
        maxRetries: 2,
      },
      [
        {
          role: "user",
          content: "我打电话开场没问题，但客户说'不需要'之后我就不知道说什么了，想练异议处理。",
        },
      ],
    );

    if (r.ok) {
      console.log(`  计划: ${r.data.title}`);
      console.log(`  步骤数: ${r.data.steps.length}（attempts=${r.attempts}, runId=${r.runId}）`);
      check("契约成功路径返回结构化数据", r.data.steps.length >= 2);
      // LLM 输出非确定性：attempts 可为 1（一次过）或 2（触发重试纠错），都算健康
      check("契约路径最终成功（含重试纠错）", r.attempts <= 2);
    } else {
      check("契约成功路径", false, JSON.stringify(r));
    }
  }

  console.log(`\n=== 4. Contract: 业务校验失败 → 重试成功 ===`);
  {
    const schema = z.object({
      score: z.number().int().min(0).max(100),
      comment: z.string().min(5),
      tags: z.array(z.string()).min(1),
    });

    const r = await runContract(
      {
        taskType: "roleplay_eval",
        tier: "turbo",
        system:
          "你是销售评估教练。为本次角色扮演打分（0-100），写一句评语，并给出 1-3 个要点标签。通过 emit_eval 工具输出。",
        toolName: "emit_eval",
        toolDescription: "输出评估结果",
        schema,
        businessValidate: (d) =>
          d.tags.length <= 3 ? { ok: true } : { ok: false, error: "标签最多 3 个" },
        fallback: () => null,
        maxRetries: 1,
      },
      [{ role: "user", content: "演练：客户问'你们比竞品贵在哪'，我答'我们服务更好'。" }],
    );

    if (r.ok) {
      console.log(`  得分: ${r.data.score}, 标签: ${r.data.tags.join(",")}`);
      console.log(`  attempts=${r.attempts}（>1 说明触发了重试纠错）`);
      check("重试后返回有效数据", r.data.score >= 0 && r.data.score <= 100);
    } else {
      check("重试后返回有效数据", false, JSON.stringify(r));
    }
  }

  console.log(`\n=== 5. Contract: 降级路径（fallback 兜底） ===`);
  {
    // 业务校验永远失败 → 重试耗尽 → fallback
    const schema = z.object({ answer: z.string() });
    const r = await runContract(
      {
        taskType: "always_fail_demo",
        tier: "turbo",
        system: "回答任意问题，通过 emit 工具输出。",
        toolName: "emit",
        toolDescription: "输出答案",
        schema,
        businessValidate: () => ({ ok: false, error: "演示用：永远失败" }),
        fallback: () => ({ answer: "模板兜底答案" }),
        maxRetries: 1,
      },
      [{ role: "user", content: "测试降级" }],
    );

    check("降级返回 fallback 数据", !r.ok && r.reason === "degraded" && r.data?.answer === "模板兜底答案");
    if (!r.ok && r.reason === "degraded") {
      console.log(`  降级原因: ${r.attempts} 次尝试后兜底（runId=${r.runId}）`);
    }
  }

  console.log(`\n=== 汇总: ${passed} 通过 / ${failed} 失败 ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n❌ 冒烟测试崩溃:", err);
  process.exit(1);
});
