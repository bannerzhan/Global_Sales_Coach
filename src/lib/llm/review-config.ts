/**
 * 复盘相关共享常量。
 *
 * 之前 review.ts 与 call-review.ts 各自定义 MAX_TURNS（24 / 40）导致同架构下
 * 复盘逻辑分裂。统一到这里，两边引用同一份，后续调阈值只改一处。
 */
export const REVIEW_MAX_TURNS = 40;
