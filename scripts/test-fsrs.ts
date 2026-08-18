/**
 * FSRS-4.5 内核单测（纯函数，无需 API / DB，秒级跑完）。
 * 运行：node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/test-fsrs.ts
 */
import {
  reviewFsrs,
  intervalFromStability,
  masteryFromStability,
  mapDeltaToRating,
  DEFAULT_WEIGHTS,
  type FsrsState,
  type Rating,
} from "../src/lib/fsrs";

const DAY = 86_400_000;
let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

function state(over: Partial<FsrsState> = {}): FsrsState {
  return { stability: 0, difficulty: 5, reps: 0, lapses: 0, lastReview: null, nextReview: null, ...over };
}

/** 构造"按计划在今天复习"的前置状态（r≈0.9） */
function onSchedule(prevS: number): FsrsState {
  const i = intervalFromStability(prevS);
  return state({ stability: prevS, difficulty: 5, reps: 1, lapses: 0, lastReview: Date.now() - i * DAY, nextReview: Date.now() });
}

console.log("FSRS-4.5 内核单测");

// 1. 评级映射
console.log("\n[1] mapDeltaToRating");
check("delta<0 → Again(1)", mapDeltaToRating(-0.1) === 1);
check("delta=0.05 → Hard(2)", mapDeltaToRating(0.05) === 2);
check("delta=0.15 → Good(3)", mapDeltaToRating(0.15) === 3);
check("delta=0.25 → Easy(4)", mapDeltaToRating(0.25) === 4);

// 2. 首次复习初始值
console.log("\n[2] 首次复习初始 S/D");
const first = reviewFsrs(state(), 3, Date.now());
check("S0(Good)=w[2]", Math.abs(first.stability - DEFAULT_WEIGHTS[2]) < 1e-9, `got ${first.stability}`);
check("D0(Good)=w[4]", Math.abs(first.difficulty - DEFAULT_WEIGHTS[4]) < 1e-9, `got ${first.difficulty}`);
check("reps=1", first.reps === 1);

// 3. 同前置下 Easy > Good > Hard 稳定性
console.log("\n[3] 评级排序（同前置）");
const base = onSchedule(5);
const sHard = reviewFsrs(base, 2 as Rating, Date.now()).stability;
const sGood = reviewFsrs(base, 3 as Rating, Date.now()).stability;
const sEasy = reviewFsrs(base, 4 as Rating, Date.now()).stability;
check("Easy > Good", sEasy > sGood, `${sEasy} !> ${sGood}`);
check("Good > Hard", sGood > sHard, `${sGood} !> ${sHard}`);

// 4. 重复 Good 单调增
console.log("\n[4] 重复 Good 稳定性单调增");
let st = reviewFsrs(state(), 3 as Rating, Date.now()); // 首次 Good（reps=1）
const series: number[] = [st.stability];
for (let i = 0; i < 4; i++) {
  const sched = onSchedule(st.stability);
  st = reviewFsrs(sched, 3 as Rating, Date.now());
  series.push(st.stability);
}
const mono = series.every((v, i) => i === 0 || v > series[i - 1]);
check("5 次 Good 后 S 递增", mono, series.join(" → "));

// 5. 遗忘降稳定性
console.log("\n[5] Again 塌缩稳定性");
const before = onSchedule(17);
const afterLapse = reviewFsrs(before, 1 as Rating, Date.now());
check("lapse 后 S 下降", afterLapse.stability < before.stability, `${afterLapse.stability} !< ${before.stability}`);
check("lapse 后 lapses+1", afterLapse.lapses === 1);
check("lapse 后 nextReview 在近期", afterLapse.nextReview! - Date.now() < 10 * DAY);

// 6. 间隔随稳定性增
console.log("\n[6] 间隔随稳定性单调递增");
check("I(20) > I(5)", intervalFromStability(20) > intervalFromStability(5));
check("I(0.9)≈S", Math.abs(intervalFromStability(10) - 10) < 1e-6, `${intervalFromStability(10)}`);

// 7. 难度 clamp [1,10]
console.log("\n[7] 难度边界");
const dEasy = reviewFsrs(onSchedule(5), 4 as Rating, Date.now()).difficulty;
const dAgain = reviewFsrs(onSchedule(5), 1 as Rating, Date.now()).difficulty;
check("Easy 难度 ∈ [1,10]", dEasy >= 1 && dEasy <= 10, `${dEasy}`);
check("Again 难度 ∈ [1,10]", dAgain >= 1 && dAgain <= 10, `${dAgain}`);
check("Again 难度 > Easy 难度", dAgain > dEasy, `${dAgain} !> ${dEasy}`);

// 8. 掌握度范围与单调
console.log("\n[8] mastery 派生");
check("mastery ∈ [0,1]", masteryFromStability(0) >= 0 && masteryFromStability(1000) <= 1);
check("mastery 随 S 单调增", masteryFromStability(5) < masteryFromStability(50));

console.log(`\n${failures === 0 ? "全部通过 ✅" : `${failures} 项失败 ❌`}`);
process.exit(failures === 0 ? 0 : 1);
