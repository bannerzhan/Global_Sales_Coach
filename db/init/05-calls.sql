-- ============================================================
-- Global Sales Coach — 模拟电话模块（Call Coach）
-- 客户档案库 + 通话记录 + 通话四维度复盘
-- 幂等：可重复执行（CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 客户档案库（customers）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                       -- 客户名/公司
  country_market  TEXT,                                -- 国家市场
  role            TEXT,                                -- 职位（采购/老板/…）
  main_product    TEXT,                                -- 主营产品
  history         TEXT,                                -- 跟我们历史（询盘/试样/下单/投诉）
  pain_points     TEXT,                                -- 已知痛点
  notes           TEXT,                                -- 备注
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_user_idx ON customers (user_id, created_at DESC);

-- ------------------------------------------------------------
-- 2. 通话记录（calls）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_snapshot JSONB,                             -- 调用时快照，防档案改了复盘对不上
  purpose           TEXT NOT NULL,                     -- 枚举值
  purpose_other     TEXT,                              -- 其他（自填）
  our_side          JSONB NOT NULL DEFAULT '{}',        -- 我们信息：product/pricePosition/relationStage/pastInteractions
  script_skeleton   JSONB,                             -- 通话脚本骨架（开场/异议/推进/收尾）
  status            TEXT NOT NULL DEFAULT 'active',     -- active / completed
  turns             JSONB NOT NULL DEFAULT '[]',        -- [{role,content,createdAt}]
  transcript        TEXT,                              -- 双方对话文字（复盘原料）
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS calls_user_idx ON calls (user_id, started_at DESC);

-- ------------------------------------------------------------
-- 3. 通话复盘（call_reviews，四维度）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review      JSONB NOT NULL,                          -- CallReviewResult 结构
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_reviews_call_idx ON call_reviews (call_id, created_at DESC);
