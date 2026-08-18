-- ============================================================
-- Global Sales Coach — 增量迁移（DoD 补强：全字段记账 / 基线评估）
-- 已在 02-schema.sql 基础上的幂等 ALTER，供已初始化数据库补列。
-- 全新部署直接跑 02 即可，本文件可重复执行。
-- ============================================================

-- ai_runs 全字段记账（§3.3）
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'volc-ark';
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC(10,5) NOT NULL DEFAULT 0;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS session_id TEXT;

-- 成本护栏告警记录
CREATE TABLE IF NOT EXISTS cost_alerts (
  id          BIGSERIAL PRIMARY KEY,
  scope       TEXT NOT NULL,
  level       TEXT NOT NULL,
  used_yuan   NUMERIC(10,5) NOT NULL DEFAULT 0,
  limit_yuan  NUMERIC(10,5) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_alerts_scope_created_idx ON cost_alerts (scope, created_at DESC);

-- 基线评估快照
CREATE TABLE IF NOT EXISTS assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension_scores  JSONB NOT NULL,
  overall_summary   TEXT,
  self_ratings      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessments_user_created_idx ON assessments (user_id, created_at DESC);

-- 演练场景增加语言字段（语言切换开关）
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'zh-CN';
