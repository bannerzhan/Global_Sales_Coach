/**
 * Step 5 冒烟测试：repo 层（本地 JSON fallback）+ LLM 目标建议。
 * 本机无 PostgreSQL/Docker，验证的是 .local-data 路径与契约链真实调用。
 * 用法: node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/smoke-onboarding.ts
 */
import { saveProfile, getProfile, isOnboarded } from "../src/lib/repo/profile";
import { addGoal, listGoals } from "../src/lib/repo/goal";
import { suggestGoals } from "../src/lib/llm/goal-suggest";
import { DEFAULT_PROFILE, type Profile } from "../src/lib/repo/types";

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

const testProfile: Omit<Profile, "userId" | "updatedAt"> = {
  ...DEFAULT_PROFILE,
  occupation: "外贸业务员",
  industry: "促销礼品",
  markets: ["US", "EU"],
  channels: ["email", "WhatsApp"],
  dailyMinutes: 45,
  englishLevel: { reading: 3, listening: 3, speaking: 2, writing: 3 },
};

async function main() {
  console.log("\n[1/3] repo 层（本地 JSON fallback）");
  check("初始未 onboarding", !(await isOnboarded()));
  const saved = await saveProfile(testProfile);
  check("saveProfile 返回完整 profile", saved.occupation === "外贸业务员");
  check("saveProfile 后 isOnboarded=true", await isOnboarded());
  const fetched = await getProfile();
  check("getProfile 读回一致", fetched?.dailyMinutes === 45 && fetched.markets.length === 2);

  const g1 = await addGoal({ title: "完成 3 轮价格异议角色扮演", targetDate: "2026-09-18" });
  const g2 = await addGoal({ title: "建立个人话术模板库", targetDate: null });
  const goals = await listGoals();
  check("addGoal 两次 → listGoals 返回 2 条", goals.length === 2);
  check("目标含日期字段", g1.targetDate === "2026-09-18");
  check("目标 id 非空", Boolean(g2.id));

  console.log("\n[2/3] LLM 目标建议（真实 ARK 调用）");
  const sug = await suggestGoals({
    profile: { userId: "test", ...testProfile, updatedAt: new Date().toISOString() },
  });
  check("suggestGoals ok", sug.ok === true);
  check("返回 1-3 个目标", (sug.goals?.length ?? 0) >= 1 && (sug.goals?.length ?? 0) <= 3);
  check("目标标题具体（长度>=6）", (sug.goals?.[0]?.title?.length ?? 0) >= 6);
  console.log("    示例目标:", sug.goals?.[0]?.title);

  console.log("\n[3/3] 本地文件确实落盘");
  const fs = await import("fs");
  const dataFile = (await import("path")).join(process.cwd(), ".local-data", "data.json");
  check("data.json 存在", fs.existsSync(dataFile));
  if (fs.existsSync(dataFile)) {
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    check("含 profile", Boolean(raw.users?.["1"]?.profile));
    check("含 2 条 goals", (raw.users?.["1"]?.goals ?? []).length === 2);
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("冒烟测试异常:", e);
  process.exit(1);
});
