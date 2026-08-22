/**
 * FSRS-4.5 引擎单元测试（Node 内置 node:test，无需额外依赖）。
 * 运行：node --import tsx --test src/lib/fsrs.test.ts
 * 覆盖：初始状态、首次复习、成功复习（Good/Hard/Easy）、遗忘（Again）塌缩、
 * 间隔单调性、难度回归、delta→评级映射、掌握度边界、纯函数无副作用。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewFsrs,
  intervalFromStability,
  masteryFromStability,
  mapDeltaToRating,
  type FsrsState,
  type Rating,
} from "./fsrs";

const DAY_MS = 86_400_000;
const INITIAL: FsrsState = {
  stability: 0,
  difficulty: 0,
  reps: 0,
  lapses: 0,
  lastReview: null,
  nextReview: null,
};

function daysBetween(a: number | null, b: number | null): number {
  if (a == null || b == null) return NaN;
  return (b - a) / DAY_MS;
}

test("首次复习（Good=3）建立初始稳定性与难度，并设定 nextReview", () => {
  const now = 1_000_000;
  const s = reviewFsrs(INITIAL, 3, now);
  assert.equal(s.reps, 1);
  assert.equal(s.lapses, 0);
  assert.ok(s.stability > 0);
  assert.ok(s.difficulty >= 1 && s.difficulty <= 10);
  assert.equal(s.lastReview, now);
  assert.ok(s.nextReview! > now);
});

test("初始稳定性 S0(G)=w[G-1]，Good=3 对应 w2=3.7145", () => {
  const s = reviewFsrs(INITIAL, 3, 1_000_000);
  assert.ok(Math.abs(s.stability - 3.7145) < 1e-4);
});

test("难度 clamp 在 [1,10]", () => {
  let s = reviewFsrs(INITIAL, 1, 1_000_000);
  for (let i = 0; i < 10; i++) s = reviewFsrs(s, 1, s.lastReview! + DAY_MS);
  assert.ok(s.difficulty <= 10 && s.difficulty >= 1);
});

test("稳定性下限 >= 0.1（不退化）", () => {
  let s = reviewFsrs(INITIAL, 1, 1_000_000);
  for (let i = 0; i < 20; i++) {
    s = reviewFsrs(s, 1, s.lastReview! + DAY_MS);
    assert.ok(s.stability >= 0.1);
  }
});

test("Again 触发遗忘：lapses+1 且稳定性塌缩 < 复习前", () => {
  const good = reviewFsrs(INITIAL, 3, 1_000_000);
  const afterGood = reviewFsrs(good, 3, good.lastReview! + 10 * DAY_MS);
  const afterAgain = reviewFsrs(afterGood, 1, afterGood.lastReview! + 10 * DAY_MS);
  assert.equal(afterAgain.lapses, 1);
  assert.ok(afterAgain.stability < afterGood.stability);
});

test("Easy 比 Good 推更高稳定性（同间隔）", () => {
  const base = reviewFsrs(INITIAL, 3, 1_000_000);
  const at = base.lastReview! + 10 * DAY_MS;
  const good = reviewFsrs(base, 3, at);
  const easy = reviewFsrs(base, 4, at);
  assert.ok(easy.stability > good.stability);
});

test("Hard 比 Good 推更低稳定性", () => {
  const base = reviewFsrs(INITIAL, 3, 1_000_000);
  const at = base.lastReview! + 10 * DAY_MS;
  const good = reviewFsrs(base, 3, at);
  const hard = reviewFsrs(base, 2, at);
  assert.ok(hard.stability < good.stability);
});

test("间隔单调：Easy > Good > Hard", () => {
  const base = reviewFsrs(INITIAL, 3, 1_000_000);
  const at = base.lastReview! + 10 * DAY_MS;
  const hard = reviewFsrs(base, 2, at);
  const good = reviewFsrs(base, 3, at);
  const easy = reviewFsrs(base, 4, at);
  const iHard = daysBetween(hard.lastReview, hard.nextReview);
  const iGood = daysBetween(good.lastReview, good.nextReview);
  const iEasy = daysBetween(easy.lastReview, easy.nextReview);
  assert.ok(iHard < iGood);
  assert.ok(iGood < iEasy);
});

test("intervalFromStability 随稳定性单调增且为正", () => {
  const a = intervalFromStability(1);
  const b = intervalFromStability(5);
  const c = intervalFromStability(20);
  assert.ok(a > 0);
  assert.ok(b > a);
  assert.ok(c > b);
});

test("难度向 D0(3)=w4 回归：连续 Easy 后难度下降", () => {
  let s = reviewFsrs(INITIAL, 2, 1_000_000);
  const d0 = s.difficulty;
  for (let i = 0; i < 8; i++) s = reviewFsrs(s, 4, s.lastReview! + DAY_MS);
  assert.ok(s.difficulty < d0);
});

test("mapDeltaToRating 边界", () => {
  assert.equal(mapDeltaToRating(-0.1), 1);
  assert.equal(mapDeltaToRating(-0.001), 1);
  assert.equal(mapDeltaToRating(0), 2);
  assert.equal(mapDeltaToRating(0.09), 2);
  assert.equal(mapDeltaToRating(0.1), 3);
  assert.equal(mapDeltaToRating(0.19), 3);
  assert.equal(mapDeltaToRating(0.2), 4);
  assert.equal(mapDeltaToRating(0.5), 4);
});

test("masteryFromStability：0→0，大S→1", () => {
  assert.ok(Math.abs(masteryFromStability(0)) < 1e-5);
  assert.ok(Math.abs(masteryFromStability(1e6) - 1) < 1e-5);
  const mid = masteryFromStability(30);
  assert.ok(mid > 0 && mid < 1);
});

test("长间隔后 Good 仍增长稳定性", () => {
  const first = reviewFsrs(INITIAL, 3, 1_000_000);
  const late = reviewFsrs(first, 3, first.lastReview! + 200 * DAY_MS);
  assert.ok(late.stability > first.stability);
});

test("reviewFsrs 不修改入参（纯函数）", () => {
  const prev: FsrsState = {
    stability: 3.7, difficulty: 5, reps: 2, lapses: 0,
    lastReview: 1_000_000, nextReview: 2_000_000,
  };
  const snap = JSON.stringify(prev);
  reviewFsrs(prev, 3, 5_000_000);
  assert.equal(JSON.stringify(prev), snap);
});

test("Rating 全集 [1,2,3,4] 都产出合法状态", () => {
  const ratings: Rating[] = [1, 2, 3, 4];
  for (const r of ratings) {
    const s = reviewFsrs(INITIAL, r, 1_000_000);
    assert.ok(Number.isFinite(s.stability));
    assert.ok(Number.isFinite(s.difficulty));
    assert.ok(s.nextReview! > s.lastReview!);
  }
});
