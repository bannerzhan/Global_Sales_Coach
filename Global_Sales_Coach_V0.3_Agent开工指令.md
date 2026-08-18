# Global Sales Coach V0.3 — Agent 开工指令（第三批：语音进阶）

> V0.1（文字闭环）、V0.2（语音 IO）的**所有锁定约束在本文件继续生效**，不可改：三层分离、AI 输出契约链、成本护栏、数据隐私边界、AI 业务幻觉策略、Prompt 四层结构、硬性 Don't、供应商策略（仅火山一家）。
> 可自由优化：Prompt 措辞、代码细节、UI 视觉。
> **立项前提**：V0.2 §1 DoD 全过（语音闭环 + 服务端中继 + 移动端 + 密钥不泄露），且 V0.1 DoD 已验收。
> **本批次节奏判断（Agent 决策，用户可推翻）**：V0.2「明确不做（第三批）」清单共 5 项，本文件对其做诚实拆分——
> - ✅ 真做：**声音复刻（seed-icl-2.0）、多音色角色扮演、实时打断（barge-in）**
> - 🔁 重构：**离线语音 → 弱网/离线韧性降级**（真·端侧推理需引入非火山模型，违反"仅火山一家"，故不碰端侧，只做网络层降级）
> - ❌ 踢出：**ASIC / 电话网关**（需电信供应商如 Twilio/阿里云通信，违反"仅火山一家"且引入新基础设施，列为独立未来轨道，不在本批次）

---

## 0. 本批次定位

在 V0.2 的"能说能听"基础上，把语音做成**拟人化、可打断、可定制音色**的教练。三项真核心：

1. **多音色角色扮演**：不同 AI 客户用不同预设音色（来自火山音色库），演练不再只有一个机械女声。
2. **声音复刻（seed-icl-2.0）**：用户上传一段录音→训练出专属 `speaker_id`→可用于"克隆某类客户音色"或"用户自听自己的表达"，让演练更真实或复盘更直观。
3. **实时打断（barge-in）**：用户说话时 AI 立即停止播报并聆听，像真人对话，不傻等念完。

全部建立在 V0.2 的**服务端 WS 中继**之上，不推翻既有架构。

---

## 1. 第三批交付范围（验收点 = 拟人化可打断语音）

Step 18-23 全部完成：

18. 多音色角色扮演（persona→speaker 映射 + 音色库配置 + 默认音色）
19. 声音复刻接入（上传/训练/状态查询/落库 `voice_profiles`）
20. barge-in 引擎（VAD + 状态机 + 回声消除 + 服务端 truncate 信号）
21. 声音复刻在 Roleplay 的应用（自定义客户音色 / 用户自听）
22. 弱网/离线韧性（WS 重连、缓冲、语音不可用时降级文字）
23. 移动端打磨 + 真机验收 ← **第三批交付点**

**明确不做（第四批及以后）**：电话网关/ASIC、端侧离线推理、实时翻译、多语言音色混用、声音复刻商用分发。

### 第三批验收 DoD（Acceptance Criteria）
- [ ] 不同场景的 AI 客户使用不同音色（多音色生效，可配置）
- [ ] 用户上传录音→训练出克隆音色→在指定场景/自听中使用，音色可管理（删除/重训）
- [ ] **barge-in 生效**：用户说话 100ms 内 AI 停止播报并切换聆听，不自己和自己对话（回声消除过关）
- [ ] 弱网卡顿时自动重连、不丢上下文；语音完全不可用时优雅降级文字模式
- [ ] 移动端：Android Chrome / iOS Safari 多音色 + 打断 + 复刻上传走通
- [ ] 成本护栏覆盖复刻训练/推理（克隆按字符计费，并入 global 100 元/月）
- [ ] 录音授权与 V0.2 一致（storage 显式同意），克隆音频不泄露
- [ ] 不引入任何非火山付费服务 / 额外基础设施

---

## 2. 技术栈（锁定；新增语音进阶部分）

| 层 | 选型 | 备注 |
|---|---|---|
| 全栈 / LLM / STT / TTS | 同 V0.2（火山方舟 + OpenSpeech） | 不变 |
| 多音色 | 火山音色库预设 `speaker_id` 映射 | 不引外部 TTS |
| 声音复刻 | 火山 seed-icl-2.0（豆包声音复刻 2.0） | 训练 API `mega_tts/audio/upload` + `mega_tts/status` |
| barge-in | Web Audio VAD（Silero WASM / 浏览器原生）+ 状态机 | 客户端检测 + 服务端 truncate |
| 回声消除 | WebRTC AEC / AudioWorklet 旁路 | 防 agent 自听 |
| 前端播放 | Web Audio `AudioContext`（suspend 即时停） | 配合 barge-in |
| 存储 | 本地磁盘 `./storage/voice`（克隆训练音频暂存 + 音色元数据） | 不引对象存储 |
| 部署 | Docker Compose（同 V0.2，新增 voice volume） | 不变 |

**供应商策略（重申）**：仅火山。声音复刻、多音色、barge-in 全在火山体系内，不引 Whisper/ ElevenLabs / Twilio 等。

---

## 3. 架构约束（继承并补充）

### 3.1 全部复用 V0.2 服务端中继
- STT/TTS 仍是浏览器 ↔ 我们的 WS 桥 ↔ 火山。V0.3 在其上叠加：
  - **多音色**：TTS 桥按 `speaker_id` 路由（见 §3.2）。
  - **复刻**：新增独立的"复刻管理"服务端模块（训练/状态），不走实时 WS，走 HTTPS。
  - **barge-in**：在 WS 桥内增加"打断事件"信道（上行用户说话→下行 truncate 指令）。

### 3.2 多音色路由（已核实官方）
- TTS `speaker` 来自火山音色库 ID；克隆音色 `speaker_id` 以 `S_` 开头，必须用 `X-Api-Resource-Id: seed-icl-2.0` 路由。
- 自动路由规则（V0.2 §3.2 已给）：`S_` 开头→`seed-icl-2.0`；含 `_uranus_`/`saturn_`→`seed-tts-2.0`；其余官方 1.0 音色→`seed-tts-1.0`。
- `scenarios.persona` 增加 `speaker_id` 字段；缺省回退 `VOICE_DEFAULT_SPEAKER` 环境变量。

### 3.3 声音复刻 API（已核实官方，注意鉴权怪癖）
- **上传训练**：`POST https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload`
  - 鉴权头：`Authorization: Bearer; {token}`（**注意是 `Bearer` 分号空格，不是 `Bearer ` 空格**）、`Resource-Id: seed-icl-2.0`
  - Body：`{ appid, speaker_id, audios:[{ audio_bytes: base64, text, audio_format }], model_type: 4, source: 2 }`
  - `model_type: 4` = ICL V2（seed-icl-2.0）；`5` = ICL V3（建议 V3）。`text` 为跟读文本，差异过大会报 `1109 WERError`。
  - 音频建议带文本、单文件 ≤10MB、推荐带降噪；克隆后约 2 分钟生效。
- **状态查询**：`POST /api/v1/mega_tts/status`，轮询 `{ status: NotFound=0/Training=1/Success=2/Failed=3/Active=4 }`，状态 2 或 4 即可用于 TTS。
- **复用 TTS**：克隆音色直接用于 V0.2 的 TTS 桥（speaker 传 `S_xxx`，Resource-Id 自动路由 seed-icl-2.0）。
- **计费**：声音复刻按字符版计费（并入成本护栏）。

### 3.4 barge-in 引擎（已核实标准做法）
- **VAD 常驻**：agent 播报期间，客户端持续对麦克风做语音活动检测（Silero WASM 或浏览器 `AudioContext` VAD），帧延迟 <30ms，召回优先（`MinSpeechDuration` ~100–200ms）。
- **打断判定**：VAD 检出语音 onset + 持续 >阈值（避开 "嗯/对" 等回填音）→ 触发 barge-in。两阶段：VAD（原始帧，低延迟）与 turn-detection（语境过滤误触发）解耦，各自可调。
- **即时停播**：客户端 `AudioContext.suspend()` / 清空播放缓冲，停止 agent 声音于 60–100ms 内。
- **服务端截断**：同时发 `truncate` 事件经 WS 桥→停 TTS 生成 + 取消在途 LLM 调用。
- **回声消除（AEC）**：用 WebRTC AEC / AudioWorklet 旁路剥离 agent 外放音频，否则 agent 会"听自己"自打断。双路 VAD（本地+服务端对 outgoing TTS 校验）降低误触发。
- **状态机**：`Listening / Processing / Responding`，barge-in 触发 `Responding → Listening` 原子切换，音频路由同步翻转（mic→STT / TTS→speaker 不重叠）。
- **上下文处理**：被截断的 agent 回复按"说到第几个词被中断"截断后写入 history（标记 `[interrupted]`），避免 LLM 重复或断片。
- **灵敏度**：`MinSilenceDuration` 默认 ≤200ms；噪声环境（车内）提高置信阈值，留配置项。

### 3.5 弱网/离线韧性（对"离线语音"的诚实重构）
- **不引入端侧推理模型**（违反仅火山 + 不引额外基础设施）。真·离线不在本批次。
- 做的是网络层韧性：WS 断线指数退避重连、音频帧缓冲不丢、重连后上下文续上；语音 WS 不可达时**自动降级文字模式**（复用 V0.1 文字闭环），恢复后提示切回语音。
- 克隆训练走 HTTPS，带超时与失败重试；训练未完成时场景回退默认音色。

### 3.6 三层分离 / 契约链 / 隐私 / 幻觉策略
- 同 V0.2，全部复用，不动。
- **复刻隐私升级**：克隆音频属最高敏感（高于 V0.2 录音）。`voice_storage` 授权需显式同意；克隆出的 `speaker_id` 仅限本用户场景内使用，禁止导出/分发（第四批商用分发明确不做）。

---

## 4. 数据模型要点（第三批新增 / 迁移）

> 复用 V0.1/V0.2 全部表。以下为新增或变更（`05-voice-advanced.sql`）。

### 4.1 `scenarios.persona` 增加 `speaker_id`
```sql
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS speaker_id TEXT;  -- 该场景 AI 客户音色，NULL 用默认
```

### 4.2 新增 `voice_profiles`（克隆音色管理）
```sql
CREATE TABLE IF NOT EXISTS voice_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  speaker_id    TEXT NOT NULL UNIQUE,          -- 火山返回的 S_xxxx
  name          TEXT NOT NULL,                 -- 用户命名，如 "美国采购 Mike"
  purpose       TEXT NOT NULL DEFAULT 'persona', -- persona(客户音色) / self_review(自听)
  status        TEXT NOT NULL DEFAULT 'training', -- training / ready / failed
  sample_ref    TEXT,                          -- ./storage/voice/<id>.wav 训练样本
  used_in_scenarios JSONB NOT NULL DEFAULT '[]', -- 关联场景 slug
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_profiles_user_idx ON voice_profiles (user_id);
```

### 4.3 `feature_flags` 扩展
```sql
INSERT INTO feature_flags (key, enabled, note) VALUES
  ('multi_speaker', FALSE, 'V0.3 多音色'),
  ('voice_clone',   FALSE, 'V0.3 声音复刻'),
  ('barge_in',      FALSE, 'V0.3 实时打断')
ON CONFLICT (key) DO NOTHING;
-- 开发期全 FALSE，Step 23 验收通过后翻 TRUE
```

### 4.4 `ai_runs` 计费维度
- V0.2 已加 `stt_seconds`/`tts_chars`/`audio_bytes`。本批次复刻训练计入 `tts_chars`（按字符版）或独立列；建议新增 `clone_train_count INT DEFAULT 0` 记录训练次数，并入 `checkAllBudgets`。

---

## 5. 第三批 API 端点（新增）

- `POST /api/voice/clone` — 上传训练音频，发起克隆（server-side 调 `mega_tts/audio/upload`）
- `GET  /api/voice/clone/:id/status` — 轮询训练状态
- `GET  /api/voice/clone` — 列出本用户音色
- `DELETE /api/voice/clone/:id` — 删除音色
- `WS /api/voice/stt` 扩展 — 新增 `barge-in` 上行事件（用户说话 onset）与 `truncate` 下行指令
- `WS /api/voice/tts` 扩展 — 支持 `speaker_id` 参数（多音色 + 克隆）
- `GET  /api/health` 再扩展 — 复刻服务连通性
- 复用 V0.2 全部语音/业务端点，仅扩展参数。

> 路由守卫同 V0.2：`src/proxy.ts` 保护，未登录拒连。

---

## 6. 第三批页面 / 组件改动

- **Roleplay 页**：AI 客户回复按 `scenario.persona.speaker_id` 用对应音色；顶部显示当前音色；支持 barge-in（说话即打断）。
- **设置页 → 语音分区**扩展：
  - 「多音色」：按场景选择/查看音色。
  - 「我的音色」：上传录音→训练→查看状态→命名→绑定到场景/自听→删除。明确告知"仅限本账号内使用，不外发"。
  - 「打断」开关（barge_in flag）。
- **复盘/自听页**：用户可选"用自己克隆音色回放"对比原声与建议表达。
- 移动优先，PWA 可安装（V0.1 DoD 项，本批次一并做实）。

---

## 7. 开发顺序（Step 18-23，对应 §1）

1. **Step 18 多音色**：`scenarios.persona.speaker_id` 迁移；TTS 桥按 speaker 自动路由 Resource-Id；设置页音色查看。
2. **Step 19 声音复刻接入**：`voice_profiles` 表 + `/api/voice/clone*` 端点（上传/状态/列表/删除）+ `./storage/voice` 落盘；server-side 调 `mega_tts`。
3. **Step 20 barge-in 引擎**：WS 桥加 barge-in 信道；客户端 VAD（Silero/原生）+ AEC；状态机；服务端 truncate + LLM 取消 + 上下文截断标记。
4. **Step 21 复刻应用**：克隆音色接入 Roleplay（自定义客户 / 自听）；绑定场景；训练中回退默认音色。
5. **Step 22 弱网韧性**：WS 重连/缓冲/降级文字；克隆训练超时重试。
6. **Step 23 移动端打磨 + 真机验收**：Android/iOS 走通多音色+打断+复刻上传；按 §1 DoD 逐项核对 ← **第三批交付点**。

---

## 8. 硬性约束（Don't，继承并补充）

- ❌ 不改 V0.1/V0.2 任何锁定项（Prompt 四层、三层分离、契约链、仅火山、不引额外基础设施）。
- ❌ **浏览器直连火山 OpenSpeech**（密钥泄露）——仍走 V0.2 服务端中继。
- ❌ **不引入端侧推理模型做真离线**（违反仅火山 + 不引额外基础设施）。离线仅做网络层降级。
- ❌ **不引入电话网关 / ASIC / 电信供应商**（违反仅火山 + 新增基础设施）——列为独立未来轨道，需用户单独决策。
- ❌ 声音复刻音频/音色**不外发、不商用分发**（第四批明确不做）。
- ❌ 克隆音色默认不跨用户共享；`voice_storage` 未授权不得训练/存储。
- ❌ barge-in 阈值写死——必须留可调配置（噪声环境误触发）。
- ❌ `feature_flags` 全 FALSE 时不得发起任何 V0.3 调用。

---

## 9. 用户待办（产品所有者行动项，Agent 需要时提醒）

| 事项 | 状态 | 说明 |
|---|---|---|
| 开通声音复刻服务 | 待办 | 控制台 → 豆包声音复刻模型 2.0 商品下单（SC2.0） |
| 获取 appid | 待办 | 复刻 API 需 `appid`，给 Agent 填 `VOLC_APP_ID` |
| 确认克隆用途边界 | 待办 | 仅客户音色 / 仅自听 / 两者？决定 `voice_profiles.purpose` 范围 |
| 克隆训练样本文案 | 待办 | 提供跟读文本（降低 WERError），Agent 接入上传引导 |
| 多音色清单 | 待办 | 从音色库挑若干预设 `speaker_id` 给 Agent 做默认映射 |
| 移动端真机 | 待办（Step 23） | Android + iOS 各一台验多音色/打断/上传 |
| 电话网关决策 | 待定（未来轨道） | 若要做，需另选电信供应商，突破仅火山约束，单独立项 |

---

## 10. 交付形态 / 验收

- Agent 交付：在 repo 上增量提交（`05-voice-advanced.sql`、`src/lib/voice/clone.ts`、`src/lib/voice/bargein.ts`、WS 桥扩展、前端组件）。不动 V0.1/V0.2 既有能力。
- 用户执行：开通复刻服务 → 填 `VOLC_APP_ID` + 多音色清单 → `bash deploy.sh` 重启（compose 新增 voice volume）→ 手机验收。
- 验收按 §1 DoD 逐项核对，通过即第四批（电话网关等需另立项）启动。

---

*来源：V0.1/V0.2 约束继承 + 火山官方声音复刻文档（`mega_tts/audio/upload`、`seed-icl-2.0`）+ barge-in 标准架构（VAD + 状态机 + AEC）核实，2026-08-18 起草。节奏判断（5 项 deferred 的拆分）为 Agent 决策，用户可推翻。*
