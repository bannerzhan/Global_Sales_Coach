-- ============================================================
-- Global Sales Coach V0.1 — 种子数据
-- 技能字典（13 维，与 src/lib/repo/skills.ts 常量保持一致）
-- ============================================================

INSERT INTO skills (id, name, dimension, parent_id, description, confidence) VALUES
  ('communication.openers',          '开场白',     'communication',    NULL, '建立开场与明确沟通意图，快速进入主题', 'high'),
  ('communication.questioning',      '需求挖掘',   'communication',    NULL, '用开放式/SPIN 式提问探明客户真实需求', 'high'),
  ('communication.value_prop',       '价值陈述',   'communication',    NULL, '把产品特性翻译成客户收益，讲清差异化价值', 'high'),
  ('communication.active_listening', '积极倾听',   'communication',    NULL, '确认理解、复述客户观点，避免自说自话', 'medium'),
  ('deal_advancement.price_objection', '价格异议', 'deal_advancement', NULL, '处理价格太高/比同行贵等异议，锚定价值而非降价', 'high'),
  ('deal_advancement.moq_objection',   'MOQ 异议', 'deal_advancement', NULL, '处理起订量要求与客户需求不匹配的异议', 'medium'),
  ('deal_advancement.urgency',         '紧迫感营造','deal_advancement', NULL, '通过稀缺/时效/机会成本推动决策', 'medium'),
  ('deal_advancement.closing',         '收单',     'deal_advancement', NULL, '识别购买信号，用试探性收单/二选一推进成交', 'high'),
  ('deal_advancement.followup',        '跟进',     'deal_advancement', NULL, '保持联系节奏，用新增价值而非催促推进', 'medium'),
  ('trust_building.rapport',           '亲和信任', 'trust_building',   NULL, '语气亲和、共情客户处境，建立可信赖形象', 'high'),
  ('trust_building.proof',             '证据背书', 'trust_building',   NULL, '用案例、数据、认证等第三方证据支撑主张', 'medium'),
  ('trust_building.negotiation',       '谈判',     'trust_building',   NULL, '在让步与坚持间找到双赢，避免单方面妥协', 'high'),
  ('trust_building.commitment',        '承诺管理', 'trust_building',   NULL, '明确下一步与双方责任，避免模糊承诺', 'medium')
ON CONFLICT (id) DO NOTHING;
