-- ============================================================
-- Global Sales Coach V0.1 — Core Schema
-- PostgreSQL 16 + pgvector (01-extensions.sql 已建 vector 扩展)
-- ============================================================

-- ------------------------------------------------------------
-- 1. 用户与画像
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                      -- bcrypt
  role          TEXT NOT NULL DEFAULT 'user',       -- V0.1 单用户
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  occupation    TEXT,                               -- e.g. foreign trade sales rep
  industry      TEXT,                               -- e.g. promotional products
  markets       JSONB NOT NULL DEFAULT '[]',        -- ["US"]
  channels      JSONB NOT NULL DEFAULT '[]',        -- ["email","whatsapp"]
  daily_minutes INT NOT NULL DEFAULT 30 CHECK (daily_minutes BETWEEN 5 AND 240),
  english_level JSONB NOT NULL DEFAULT '{}',        -- {reading,listening,speaking,writing}
  locale        TEXT NOT NULL DEFAULT 'zh-CN',
  timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. 目标与里程碑（Goal Interview 产出）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  target_date DATE,
  status     TEXT NOT NULL DEFAULT 'active',        -- active / achieved / abandoned
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
-- 3. Skill Graph（13 维底层 schema，3 个聚合维度用于基线测评）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY,                     -- 稳定 code，如 'negotiation.price_objection'
  name        TEXT NOT NULL,
  dimension   TEXT NOT NULL,                        -- 聚合维度: communication / deal_advancement / trust_building
  parent_id   TEXT REFERENCES skills(id),
  description TEXT,
  confidence  TEXT NOT NULL DEFAULT 'low'           -- low / medium / high（测评证据强度）
);

-- FSRS 调度状态（SRS Adapter 唯一读写入口，业务代码不直接碰）
CREATE TABLE IF NOT EXISTS skill_states (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id      TEXT NOT NULL REFERENCES skills(id),
  mastery       REAL NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 1),
  -- FSRS 内核字段
  stability     REAL NOT NULL DEFAULT 0,
  difficulty    REAL NOT NULL DEFAULT 5,
  reps          INT NOT NULL DEFAULT 0,
  lapses        INT NOT NULL DEFAULT 0,
  last_review   TIMESTAMPTZ,
  next_review   TIMESTAMPTZ,                        -- SRS Scheduler 排课依据
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

-- 基线评估快照（Onboarding 末尾跑一次，3 个销售结果导向聚合维度）
CREATE TABLE IF NOT EXISTS assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension_scores  JSONB NOT NULL,                  -- [{dimension, score 0-10, summary}]
  overall_summary   TEXT,
  self_ratings      JSONB,                           -- 用户自评（1-5），可选
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_user_created_idx ON assessments (user_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. 场景库（可编辑，Agent 生成 seed + 用户审核）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  category          TEXT NOT NULL,                  -- inquiry / quotation / negotiation / complaint / followup / closing ...
  difficulty        INT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  persona           JSONB NOT NULL,                 -- 买家画像：role, nationality, temperament...
  objectives        JSONB NOT NULL DEFAULT '[]',    -- 练习目标（对应 skill ids）
  pressure_sequence JSONB NOT NULL DEFAULT '[]',    -- 压力递进：price push / MOQ / urgency...
  work_context_seed TEXT,                           -- 用户粘贴的真实产品/邮件/RFQ
  locale            TEXT NOT NULL DEFAULT 'zh-CN',   -- 演练语言："zh-CN" | "en"
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. 课程与练习
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_date DATE NOT NULL,
  spec        JSONB NOT NULL,                       -- LessonSpec（任务序列、难度、目标）
  status      TEXT NOT NULL DEFAULT 'planned',      -- planned / in_progress / completed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_date)
);

CREATE TABLE IF NOT EXISTS attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     UUID REFERENCES lessons(id) ON DELETE SET NULL,
  skill_id      TEXT REFERENCES skills(id),
  scenario_id   UUID REFERENCES scenarios(id),
  task_type     TEXT NOT NULL,                      -- drill / roleplay_turn / retry
  user_input    TEXT NOT NULL,
  evaluation    JSONB,                              -- evaluate_attempt 的结构化输出
  score         REAL CHECK (score BETWEEN 0 AND 10),
  is_retry      BOOLEAN NOT NULL DEFAULT FALSE,     -- Immediate Retry 标记
  attempt_no    INT NOT NULL DEFAULT 1,             -- 同一任务第几次尝试
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roleplay_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id  UUID NOT NULL REFERENCES scenarios(id),
  lesson_id    UUID REFERENCES lessons(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'active',      -- active / completed / aborted
  turns        JSONB NOT NULL DEFAULT '[]',         -- [{role,content,evaluation}]
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 6. 记忆系统（向量召回）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                         -- mistake / preference / fact / win
  content    TEXT NOT NULL,
  embedding  vector(1024),                          -- 豆包 embedding 维度，LLMProvider 启动时校验
  source     TEXT,                                  -- attempt_id / roleplay_session_id
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------------------
-- 7. Prompt 版本化（四层模板实例，可回放）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          BIGSERIAL PRIMARY KEY,
  task_type   TEXT NOT NULL,                        -- generate_lesson / evaluate_attempt / generate_roleplay / extract_memory / goal_interview
  version     INT NOT NULL,
  template    TEXT NOT NULL,                        -- 完整四层模板实例（SYSTEM/POLICY/CONTEXT/TASK）
  json_schema JSONB NOT NULL,                       -- 输出 schema 快照
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_type, version)
);

-- ------------------------------------------------------------
-- 8. AI 运行记账（成本护栏数据源，含 reasoning tokens）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_runs (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  task_type        TEXT NOT NULL,
  provider         TEXT NOT NULL DEFAULT 'volc-ark', -- 供应商（V0.1 仅火山方舟）
  model            TEXT NOT NULL,                   -- endpoint id 或 model id
  prompt_version   INT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending / ok / schema_invalid / business_invalid / retried / degraded / dead_letter
  retry_count      INT NOT NULL DEFAULT 0,
  input_tokens     INT NOT NULL DEFAULT 0,
  output_tokens    INT NOT NULL DEFAULT 0,
  reasoning_tokens INT NOT NULL DEFAULT 0,          -- 思考模型必记
  cost_estimate    NUMERIC(10,5) NOT NULL DEFAULT 0,-- 本次估算成本（元）
  session_id       TEXT,                            -- 会话级预算追踪（roleplay session id）
  latency_ms       INT,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 成本护栏告警记录（超限即落库，不静默）
CREATE TABLE IF NOT EXISTS cost_alerts (
  id          BIGSERIAL PRIMARY KEY,
  scope       TEXT NOT NULL,                       -- request / session / user_daily / global
  level       TEXT NOT NULL,                       -- warn / degrade / block
  used_yuan   NUMERIC(10,5) NOT NULL DEFAULT 0,
  limit_yuan  NUMERIC(10,5) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_alerts_scope_created_idx ON cost_alerts (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_user_created_idx ON ai_runs (user_id, created_at DESC);

-- 成本护栏预算（四级：request / session / user_daily / global）
CREATE TABLE IF NOT EXISTS cost_budgets (
  scope       TEXT PRIMARY KEY,                     -- request / session / user_daily / global
  limit_yuan  NUMERIC(10,2) NOT NULL,               -- 单次/每日/全局上限（元）
  alert_yuan  NUMERIC(10,2),                        -- 告警阈值
  action      TEXT NOT NULL DEFAULT 'warn'          -- warn / degrade / block
);

INSERT INTO cost_budgets (scope, limit_yuan, alert_yuan, action) VALUES
  ('request',    0.50, 0.40, 'block'),
  ('session',    5.00, 4.00, 'degrade'),
  ('user_daily', 5.00, 4.00, 'degrade'),
  ('global',   100.00, 80.00, 'warn')               -- 月度全局 100 元
ON CONFLICT (scope) DO NOTHING;

-- ------------------------------------------------------------
-- 9. 功能开关（Feature Flags）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  note       TEXT
);

INSERT INTO feature_flags (key, enabled, note) VALUES
  ('voice_mode',   FALSE, 'Phase 2 语音，V0.1 关闭'),
  ('retry_loop',   TRUE,  'Immediate Retry 核心闭环'),
  ('memory_recall', TRUE, '记忆向量召回')
ON CONFLICT (key) DO NOTHING;
