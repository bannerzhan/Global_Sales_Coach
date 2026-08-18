# Global Sales Coach V0.2 — Agent 开工指令（第二批：语音 Phase 2）

> 本文件是第一批 `Global_Sales_Coach_V0.1_Agent开工指令.md` 的续篇，专门展开"第二批（语音）"。
> 第一批所有**已锁定的约束在本文件继续生效**，不可改：三层分离、AI 输出契约链、成本护栏、数据隐私边界、AI 业务幻觉策略、Prompt 四层结构、硬性 Don't 列表、供应商策略（仅火山一家）。
> 可自由优化的仅限：Prompt 文字措辞、代码实现细节、UI 视觉细节。
> **立项前提**：第一批 §1 DoD 全过（含基线评估 3 聚合维度、PWA 可安装、成本护栏告警、无幻觉专项测试），验收通过后方可启动本批次。

---

## 0. 本批次定位

给 V0.1 的文字 Roleplay 闭环加**语音通道**：用户用语音输入、AI 客户用语音回复，文字闭环的全部能力（Evaluation / Immediate Retry / Skill·Memory·FSRS 更新）原样保留。语音是 **IO 层**，不是新模型层——LLM 仍是火山方舟 doubao-seed 系列，契约链不变。

**关键事实（已核实官方文档）**：STT / TTS 走的主机是 `openspeech.bytedance.com`，与 LLM 的 `ark.cn-beijing.volces.com` **是两个不同的服务、两套鉴权头**。这决定了语音必须走**服务端 WebSocket 中继**，浏览器不能直接持有密钥直连。

---

## 1. 第二批交付范围（验收点 = 语音闭环跑通）

Step 9-17 全部完成：

9. 语音接入层（server-side WS 中继：STT 桥 + TTS 桥），统一鉴权与错误
10. 前端音频采集与播放组件（采集 PCM / 播放流式音频）
11. `ai_runs` 语音成本字段迁移 + 计费常量 + 护栏接入语音
12. 录音存储（audio_assets 表 + 本地磁盘 + 回放）
13. Roleplay 页语音输入/输出通道（替代或增强文本）
14. 语音专属 Evaluation（流利度/发音维度，可选 LLM 润色）
15. Immediate Retry 语音化
16. 隐私授权层（录音 storage 显式同意）+ feature_flag 切换
17. 移动端打磨 + PWA + 语音 DoD 验收 ← **第二批交付点**

**明确不做（第三批）**：声音复刻（seed-icl）、多音色角色扮演、离线语音、实时打断中断（barge-in）、ASIC/电话网关。

### 第二批验收 DoD（Acceptance Criteria）
- [ ] Roleplay 支持语音输入（按住说话）→ STT 实时转写 → 进 LLM 角色扮演 → AI 回复 TTS 流式播放 + 字幕
- [ ] 完整闭环语音化：语音输入 → 文本 attempt → Evaluation → Immediate Retry（可语音）→ Skill/Memory/FSRS 更新，全链路跑通
- [ ] 录音可存储（用户授权后），音频资产可回放；关闭授权则只留转写文本
- [ ] 成本护栏覆盖语音：stt_seconds / tts_chars 计入，`global` 100 元/月仍生效
- [ ] 移动端可用：Android Chrome / iOS Safari 麦克风权限 + 播放正常（PWA 可安装）
- [ ] **API Key 不泄露到浏览器**（服务端中继，前端只持有我们自己的 WS 地址）
- [ ] `feature_flags.voice_mode = false` 时完全回退文字模式，零语音依赖
- [ ] 无第三方付费服务（除火山引擎一家）

---

## 2. 技术栈（锁定，不可改；新增语音部分）

| 层 | 选型 | 备注 |
|---|---|---|
| 全栈框架 | Next.js（App Router）+ TypeScript | 第一批已定，语音走其内部 WS/SSE 路由 |
| LLM | 火山方舟 doubao-seed-2.1-pro / turbo | 不变，语音只是把其文本输出转音频 |
| **STT** | **豆包流式语音识别模型 2.0（doubao-seed-asr-2.0）** | WebSocket 双向流式，逐字返回 |
| **TTS** | **豆包语音合成大模型 2.0（doubao-seed-tts-2.0）** | WebSocket 双向流式，逐字输入、首包 <300ms |
| 语音主机 | `openspeech.bytedance.com`（与 Ark 不同主机） | 服务端中继，密钥不出后端 |
| 前端采集 | Web Audio API + MediaRecorder / AudioWorklet | 采集 16kHz/16bit/mono PCM |
| 前端播放 | Web Audio API AudioBufferSourceNode / `<audio>` | 流式分片播放 |
| 存储 | 本地磁盘 `./storage/audio`（Docker volume 挂载） | 单用户，不引对象存储（符合硬性 Don't） |
| 认证 | Auth.js credentials | 不变；语音接口复用登录会话 |
| 部署 | Docker Compose 一键脚本 | 不变 |

**供应商策略（重申）**：除火山引擎外不依赖任何第三方付费服务。STT/TTS 与 LLM 同属火山账号，共用一套 API Key 体系。

---

## 3. 架构约束（继承自第一批，并补充语音专用）

### 3.1 语音必须走服务端 WS 中继（核心纠偏，不可省）
- 浏览器**禁止**直接持有 `X-Api-Key` 直连 `openspeech.bytedance.com`。
- 架构：浏览器 WS ↔ **我们的 Next.js WS 桥（server-side）** ↔ 火山 OpenSpeech WS。
- STT 桥与 TTS 桥各一条，统一在桥里做：鉴权注入、错误归一、超时、成本记账、音频落库。
- 理由：① 不泄露密钥；② 服务端统一记账与护栏；③ 录音资产集中落库；④ 移动端兼容性由我们统一兜底。

### 3.2 鉴权与端点（已核实官方）
- **统一密钥**：新增环境变量 `VOLC_API_KEY`（火山引擎控制台 API Key），默认回退 `ARK_API_KEY`。
- **STT（豆包流式语音识别 2.0）**
  - 推荐端点（双向流式·优化版，低延迟）：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`
  - 备选：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`（普通双向）、`.../bigmodel_nostream`（流式输入）
  - 鉴权头：`X-Api-Key: <VOLC_API_KEY>`
  - `X-Api-Resource-Id`：`volc.bigasr.sauc.duration`（小时版，按分钟计费，推荐）/ `volc.bigasr.sauc.concurrent`（并发版）
  - 音频：16kHz / 16bit / 单声道 PCM，单包 100–200ms（优化版建议 200ms），gzip 帧协议
  - 计费维度：**分钟**（音频时长）
- **TTS（豆包语音合成 2.0）**
  - 推荐端点（双向流式，逐字输入贴合 LLM 流式）：`wss://openspeech.bytedance.com/api/v3/tts/bidirection`
  - 备选（HTTP Chunked 单向，实现更简单，可作降级）：`https://openspeech.bytedance.com/api/v3/tts/unidirectional`
  - 鉴权头：`X-Api-Key`、`X-Api-Resource-Id: seed-tts-2.0`、`X-Api-Request-Id: <uuid>`、`X-Control-Require-Usage-Tokens-Return: *`（返回计费字符数）
  - `speaker`：从控制台音色库取音色 ID（如 `zh_female_qingxin` 等），V0.2 固定 1–2 个客服音色，不开放复刻
  - 首包延迟 <300ms，边生成边播放
  - 计费维度：**字符数**（合成文本长度）
- **实现建议**：优先用火山官方 OpenSpeech SDK 封装 STT/TTS 的二进制帧协议，避免手撸 framing；Node 直连需自行实现其 gzip 帧格式。TTS 若中继成本高，可先走 HTTP Chunked 单向流式降级，再升 WS 双向。

### 3.3 三层分离仍然适用
- **Learning Priority / SRS Scheduler / Mastery**：与语音无关，完全复用第一批，不动。
- **语音专属能力**归入新的 `VoiceAdapter` 接口（对标第一批的 `SRSAdapter`）：业务代码只调 `transcribe()` / `synthesize()`，不直接碰 WS 帧。

### 3.4 AI 输出契约链仍然适用
- 语音不改变 LLM 调用方式：角色扮演、Evaluation、复盘仍是 Ark 上的结构化输出契约链。
- TTS 只是把 LLM 的**文本**输出转音频，**不引入新的 LLM 调用**（除非做语音专属润色，留作 Step 14 可选）。
- 复盘的 `feedback_language` / `feedback_business` 字段不变。

### 3.5 成本护栏（扩展，不是新建）
- 第一批 `ai_runs` 只有 LLM token 字段，**没有语音成本字段**——本批次补。
- 语音产品烧钱在 **STT 分钟 + TTS 字符 + LLM token** 三层叠加。
- 四级预算（request / session / user_daily / global=100 元/月）继续生效；语音成本并入同一 `checkAllBudgets` 流程。
- 新增计费常量：`STT_YUAN_PER_MIN`、`TTS_YUAN_PER_CHAR`（估算，上线前按官网校准，同第一批 `PRICING` 注释约定）。

### 3.6 数据隐私边界（语音升级为最高敏感级）
- 第一批已定：真正边界是**服务端 DLP / PII Redaction**，客户端脱敏可绕过。
- 录音 = 最高敏感级。`storage` 授权需**单独显式同意**（不随登录默认开启）。
- "不存录音" ≠ "不发 LLM"：STT 转写文本仍会进 LLM（这是角色扮演所需），但原始音频仅在用户显式授权后才落库。
- 隐私授权分层（第一批 §3.4）在语音下扩展：新增 `voice_storage` 授权开关。

### 3.7 Prompt 四层结构不变
- 语音是 IO 通道，不改 `[SYSTEM]/[POLICY]/[CONTEXT]/[TASK]` 四层。
- 若 Step 14 做语音专属润色（如把书面表达改成更口语的教练口吻），属于新的 `task_type=polish_speech`，仍是同一套模板实例，只换 `[TASK]` 与 schema。

---

## 4. 数据模型要点（第二批新增 / 迁移）

> 复用第一批所有表。以下为**新增或变更**。

### 4.1 `ai_runs` 加语音成本字段（迁移 `04-voice.sql`）
```sql
ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS stt_seconds   NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tts_chars     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_bytes   BIGINT NOT NULL DEFAULT 0;
-- 计费汇总视图/护栏需把 stt_seconds*STT_YUAN_PER_MIN/60 + tts_chars*TTS_YUAN_PER_CHAR 并入
```

### 4.2 新增 `audio_assets`（录音 / 合成音频资产）
```sql
CREATE TABLE IF NOT EXISTS audio_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,          -- stt_input / tts_output / roleplay_full
  ref         TEXT NOT NULL,          -- 本地相对路径 ./storage/audio/<id>.webm
  format      TEXT NOT NULL DEFAULT 'webm',
  bytes       BIGINT NOT NULL DEFAULT 0,
  duration_s  NUMERIC(10,3),
  attempt_id  UUID REFERENCES attempts(id) ON DELETE SET NULL,
  session_id  UUID REFERENCES roleplay_sessions(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 索引：按用户+时间回放
CREATE INDEX IF NOT EXISTS audio_assets_user_created_idx
  ON audio_assets (user_id, created_at DESC);
```

### 4.3 `attempts.user_input` 语义扩展
- 文字模式：`user_input` = 用户输入文本。
- 语音模式：`user_input` = **STT 转写文本**；原始音频存 `audio_assets(kind=stt_input)`，通过 `attempt_id` 关联。Evaluation / 复盘逻辑对两种模式无差别。

### 4.4 `feature_flags`
- 第一批已建 `voice_mode = FALSE`（'Phase 2 语音，V0.1 关闭'）。本批次开发期保持 FALSE，Step 16 验收通过后翻 TRUE。
- 新增 `voice_storage_consent` 概念（实际落在用户授权表或 profiles 扩展 JSONB，不在 flags 里）。

---

## 5. 第二批 API 端点（新增，App Router route handlers / WS）

- `WS /api/voice/stt` — 浏览器 ↔ 我们的 STT 桥 ↔ 火山；上行音频帧，下行转写文本（流式）
- `WS /api/voice/tts` — 浏览器 ↔ 我们的 TTS 桥 ↔ 火山；上行文本（可逐字），下行音频分片（流式）
- `POST /api/voice/synthesize`（可选降级）— HTTP 一次性合成，返回音频流
- `POST /api/voice/consent` — 用户授权/撤回录音 storage
- `GET  /api/voice/assets?session_id=` — 列出/回放某次演练的录音资产
- `GET  /api/health` 扩展 — 增加 STT/TTS 连通性 + 语音预算状态
- 复用第一批：`/api/roleplay/session`、`/api/roleplay/attempt`、`/api/roleplay/retry`、`/api/memory/extract` 不变，仅前端在语音模式下改用语音 IO。

> 注：Next.js 16 用 `src/proxy.ts` 做路由守卫（第一批已定），语音 WS 路由同样受登录保护（未登录拒连）。

---

## 6. 第二批页面 / 组件改动

- **Roleplay 页（`/practice/[id]`）**：新增"按住说话 / 点击说话"按钮，替代或增强文本输入框。AI 客户回复区增加"🔊 播放 / 字幕"切换（TTS 流式播放 + 文本字幕）。
- **Immediate Retry 页**：同样支持语音输入/输出。
- **设置页（Settings）**：新增"语音"分区——开关语音模式（受 `voice_mode` flag + 用户授权双控）、录音存储同意开关、音色选择（限定 1–2 个）、麦克风权限引导。
- **回放页 / 历史页**：演练记录可展开听原声（stt_input + tts_output）。
- 移动优先，PWA manifest + service worker 可安装（第一批 DoD 项，本批次一并做实）。

---

## 7. 开发顺序（Step 9-17，对应 §1）

1. **Step 9 语音接入层**：实现 `VoiceAdapter`（STT 桥 + TTS 桥），server-side WS 中继，统一鉴权/错误/超时。先用官方 SDK 或实现帧协议的最小可用版。
2. **Step 10 前端采集/播放**：AudioWorklet 采集 16kHz PCM；AudioContext 播放流式分片。封装成 `<VoiceInput>` / `<VoicePlayer>` 组件。
3. **Step 11 成本迁移**：`04-voice.sql` 加字段；`accounting.ts` 加 `STT_YUAN_PER_MIN` / `TTS_YUAN_PER_CHAR` 常量，`recordRun` 接收语音成本，`checkAllBudgets` 并入。
4. **Step 12 录音存储**：`audio_assets` 表 + `./storage/audio` 本地落盘（Docker volume）+ 回放接口。
5. **Step 13 Roleplay 语音通道**：接线 STT→attempt→LLM→TTS，字幕同步。
6. **Step 14 语音专属 Evaluation（可选）**：在 Evaluation schema 加 `fluency` / `pronunciation` 维度；可选 `polish_speech` 润色（新 task_type）。
7. **Step 15 Immediate Retry 语音化**：重练支持语音输入/输出，逻辑复用第一批 retry 流程。
8. **Step 16 隐私授权 + flag 切换**：`voice_storage` 显式同意；`voice_mode` 控制全量回退。
9. **Step 17 移动端打磨 + PWA + 验收**：Android/iOS 真机走通，按 §1 DoD 逐项核对 ← **第二批交付点**。

---

## 8. 硬性约束（Don't，继承并补充）

- ❌ 不改第一批已锁定的：Prompt 四层结构、三层分离、契约链、供应商策略、不引额外基础设施。
- ❌ **浏览器直连火山 OpenSpeech（泄露 X-Api-Key）**——必须服务端中继。
- ❌ 不引入 Supabase / Vercel / Redis / 对象存储 / 第三方 ASR·TTS（仅火山一家）。
- ❌ 不做声音复刻（seed-icl）、多音色、实时打断（barge-in）、电话网关（第三批）。
- ❌ 不在客户端做"脱敏"当安全边界（服务端 DLP 才是）。
- ❌ 不把"伪精确数字"写进代码当事实（如首包 300ms、费率等只当方向，上线前按官网校准）。
- ❌ 录音默认落库——必须用户显式授权 `voice_storage`。
- ❌ `voice_mode=false` 时任何代码路径不得发起语音 WS / 计费。

---

## 9. 用户待办（产品所有者行动项，Agent 需要时提醒）

| 事项 | 状态 | 说明 |
|---|---|---|
| 开通语音服务 | 待办 | 火山引擎控制台 → 豆包语音 → 开通"语音识别大模型 2.0"与"语音合成大模型 2.0" |
| 获取 API Key | 待办 | 控制台 API Key 管理，填 `VOLC_API_KEY`（可与 `ARK_API_KEY` 同值）；Resource-Id 按 §3.2 填 |
| 选择音色 | 待办 | 控制台音色库挑 1–2 个客服音色 ID，给 Agent |
| 确认计费档 | 待办 | 小时版 `volc.bigasr.sauc.duration` 还是并发版；TTS 字符版 `seed-tts-2.0` |
| 录音授权文案 | 待办 | 提供隐私授权告知文案（storage 层），Agent 接入设置页 |
| 移动端真机测试 | 待办（Step 17） | Android Chrome + iOS Safari 各一台走通麦克风/播放 |

---

## 10. 交付形态 / 验收

- Agent 交付：在 V0.1 repo 上增量提交（新增 `04-voice.sql`、`src/lib/voice/`、`src/app/api/voice/*`、前端语音组件），不动既有文字闭环。
- 用户执行：开通语音服务 → 填 `VOLC_API_KEY` 与音色 → `bash deploy.sh` 重启（compose 不变，仅新增 storage volume）→ 手机打开验收。
- 验收按 §1 DoD 逐项核对，验收通过即第三批（声音复刻 / 多音色 / 打断等）立项。

---

*来源：第一批 `Global_Sales_Coach_V0.1_Agent开工指令.md` §0/§2/§3 约束继承 + 火山引擎官方 OpenSpeech 文档（STT `sauc/bigmodel_*`、TTS `tts/bidirection` 与 `tts/unidirectional`）核实，2026-08-18 起草。*
