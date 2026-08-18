/**
 * FSRS-4.5 间隔重复内核（纯函数，零依赖）。
 *
 * 算法来源：open-spaced-repetition/awesome-fsrs — The Algorithm（FSRS-4.5，17 参数 w0..w16）。
 * 模型：每张"卡片"（这里是一个技能）维护 stability(S, 天) 与 difficulty(D, 1..10)，
 * 复习时按评级 {1:Again, 2:Hard, 3:Good, 4:Easy} 更新 S/D，并由 S 推出下次复习间隔。
 *
 * 为什么不用简单阈值表：真实记忆的遗忘曲线是非线性的，FSRS 用 S 描述留存随时间衰减
 * （R(t)=exp(-t/S)），按"期望留存率"反推间隔，复盘表现越好 S 增长越多、间隔拉得越长，
 * 表现退步（Again）则 S 塌缩、进入重学。这是 Global Sales Coach 复习调度的核心。
 */

export type Rating = 1 | 2 | 3 | 4; // Again / Hard / Good / Easy

export interface FsrsState {
  stability: number; // S，单位天，R=90% 时的记忆留存间隔
  difficulty: number; // D，1..10
  reps: number; // 复习次数 n
  lapses: number; // 遗忘次数 l
  lastReview: number | null; // epoch ms
  nextReview: number | null; // epoch ms
}

/** FSRS-4.5 默认权重（与官方保持一致，可由训练数据微调） */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367,
  1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

/** 默认期望留存率（复习时希望记住的概率） */
export const DEFAULT_RETENTION = 0.9;

const DAY_MS = 86_400_000;
const DECAY = -0.5;
const FACTOR = 19 / 81; // ≈ 0.23457

/** 掌握度派生参考稳定性（天）：mastery = 1 - e^(-S/REF) */
const MASTERY_REF = 30;

function clampDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

/** 初始难度 D0(G) = w4 - (G-3)·w5 */
function initDifficulty(rating: Rating): number {
  return clampDifficulty(DEFAULT_WEIGHTS[4] - (rating - 3) * DEFAULT_WEIGHTS[5]);
}

/** 初始稳定性 S0(G) = w[G-1] */
function initStability(rating: Rating): number {
  return DEFAULT_WEIGHTS[rating - 1];
}

/** 复习时刻的可提取概率（留存）R = exp(-Δt/S) */
function retrievability(elapsedDays: number, stability: number): number {
  return Math.exp(-elapsedDays / Math.max(stability, 0.1));
}

/** 复习后难度 D' = w7·D0(3) + (1-w7)·(D - w6·(G-3))，向 D0(3)=w4 轻微回归 */
function nextDifficulty(prevD: number, rating: Rating): number {
  const d0 = DEFAULT_WEIGHTS[4];
  const d = DEFAULT_WEIGHTS[7] * d0 + (1 - DEFAULT_WEIGHTS[7]) * (prevD - DEFAULT_WEIGHTS[6] * (rating - 3));
  return clampDifficulty(d);
}

/** 成功复习（Hard/Good/Easy）后稳定性 */
function nextStabilitySuccess(prevS: number, prevD: number, rating: Rating, r: number): number {
  let mult = 1;
  if (rating === 2) mult = DEFAULT_WEIGHTS[15]; // Hard 折扣
  else if (rating === 4) mult = DEFAULT_WEIGHTS[16]; // Easy 加成
  const a =
    DEFAULT_WEIGHTS[8] *
    (11 - prevD) *
    Math.pow(prevS, -DEFAULT_WEIGHTS[9]) *
    (Math.exp(DEFAULT_WEIGHTS[10] * (1 - r)) - 1) *
    mult;
  return prevS * (Math.exp(a) + 1);
}

/** 遗忘（Again）后稳定性：S 塌缩 */
function nextStabilityLapse(prevS: number, prevD: number, r: number): number {
  return (
    DEFAULT_WEIGHTS[11] *
    Math.pow(prevD, -DEFAULT_WEIGHTS[12] * (Math.pow(prevS + 1, DEFAULT_WEIGHTS[13]) - 1)) *
    Math.exp(DEFAULT_WEIGHTS[14] * (1 - r))
  );
}

/** 由稳定性 S 推下次复习间隔（天），给定期望留存率。I = S/FACTOR·(r^(1/DECAY) - 1) */
export function intervalFromStability(stability: number, desiredRetention = DEFAULT_RETENTION): number {
  const target = Math.pow(desiredRetention, 1 / DECAY); // = r^(-2)
  return (stability / FACTOR) * (target - 1);
}

/** 由稳定性派生 0-1 掌握度（展示用，单一真相来自 S） */
export function masteryFromStability(stability: number): number {
  return Math.min(1, Math.max(0, 1 - Math.exp(-stability / MASTERY_REF)));
}

/** 把复盘给的技能增量 delta(-0.3~0.3) 映射成 FSRS 评级 */
export function mapDeltaToRating(delta: number): Rating {
  if (delta < 0) return 1; // 掌握度退步 → 遗忘，进重学
  if (delta < 0.1) return 2; // 小幅进步 → Hard
  if (delta < 0.2) return 3; // 中进 → Good
  return 4; // 大进 → Easy
}

/** 执行一次复习，返回新状态（纯函数） */
export function reviewFsrs(
  prev: FsrsState,
  rating: Rating,
  nowMs: number,
  desiredRetention = DEFAULT_RETENTION,
): FsrsState {
  const prevS = prev.stability;
  const prevD = prev.difficulty;
  const elapsedDays = prev.lastReview != null ? Math.max(0, (nowMs - prev.lastReview) / DAY_MS) : 0;
  const r = prev.lastReview != null ? retrievability(elapsedDays, prevS) : 1;

  let stability: number;
  let difficulty: number;
  let reps: number;
  let lapses: number;

  if (prev.reps === 0) {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    reps = 1;
    lapses = 0;
  } else if (rating === 1) {
    stability = nextStabilityLapse(prevS, prevD, r);
    difficulty = nextDifficulty(prevD, rating);
    reps = prev.reps + 1;
    lapses = prev.lapses + 1;
  } else {
    stability = nextStabilitySuccess(prevS, prevD, rating, r);
    difficulty = nextDifficulty(prevD, rating);
    reps = prev.reps + 1;
    lapses = prev.lapses;
  }

  stability = Math.max(0.1, stability); // 下限防退化
  const intervalDays = intervalFromStability(stability, desiredRetention);
  return {
    stability,
    difficulty,
    reps,
    lapses,
    lastReview: nowMs,
    nextReview: nowMs + intervalDays * DAY_MS,
  };
}
