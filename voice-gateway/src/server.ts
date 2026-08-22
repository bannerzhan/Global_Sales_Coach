/**
 * 独立 WS 语音网关（X 方案）。
 *
 * 监听独立端口（默认 8787），浏览器经 Next 的 /api/voice/ws 代理升级后连到这里。
 * 首帧 JSON 决定会话类型：
 *   { type: "transcribe", sessionId }            —— 纯语音转文字（电话模块的实时字幕）
 *   { type: "dialogue", sessionId, systemPrompt } —— 三段流式：ASR → LLM → TTS
 *
 * 浏览器 → 网关 的后续帧：
 *   { type: "audio", data: "<base64 16k PCM>" }  —— 一包音频
 *   { type: "end" }                              —— 用户停话（PTT 松开）
 *   { type: "cancel" }                           —— PTT 滑出取消，丢弃本句
 *
 * 网关 → 浏览器：
 *   { type: "partial", text }    中间识别
 *   { type: "final", text }      最终识别（一句）
 *   { type: "llm_delta", text }  LLM 增量
 *   { type: "llm_done", text }   LLM 完整
 *   { type: "tts_audio", data }  一包合成音频(base64)
 *   { type: "tts_done" }         TTS 结束
 *   { type: "error", message }   错误
 *   { type: "info", message }    提示（如降级）
 *
 * 密钥全在后端：VOICE_API_KEY（火山语音）/ ARK_API_KEY（方舟 LLM），前端不接触。
 */

import WebSocket from "ws";
import { WebSocketServer } from "ws";
import { VolcanoAsr } from "./adapters/asr";
import { VolcanoTts } from "./adapters/tts";
import { streamLlm } from "./adapters/llm";

const PORT = Number(process.env.VOICE_GATEWAY_PORT || 8787);
const VOICE_API_KEY = process.env.VOICE_API_KEY || "";
const ARK_API_KEY = process.env.ARK_API_KEY || "";

interface Session {
  type: "transcribe" | "dialogue";
  asr?: VolcanoAsr;
  systemPrompt?: string;
  ttsSpeaking: boolean;
}

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let session: Session | null = null;
  let pendingUserText = "";

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    // --- 首帧：建立会话 ---
    if (!session) {
      if (msg.type === "transcribe") {
        session = { type: "transcribe", ttsSpeaking: false };
        const asr = new VolcanoAsr(VOICE_API_KEY, {
          onPartial: (t) => send(ws, { type: "partial", text: t }),
          onFinal: (t) => send(ws, { type: "final", text: t }),
          onError: (e) => send(ws, { type: "error", message: e }),
          onClose: () => {},
        });
        asr.start().catch((e) => send(ws, { type: "error", message: String(e) }));
        session!.asr = asr;
        if (!VOICE_API_KEY) send(ws, { type: "info", message: "ASR 降级模式（无 VOICE_API_KEY）" });
        return;
      }
      if (msg.type === "tts") {
        // 纯文字 → 语音合成（朗读按钮用，不触发 ASR/LLM）
        session = { type: "dialogue", systemPrompt: "", ttsSpeaking: false };
        const tts = new VolcanoTts(VOICE_API_KEY, {
          onAudio: (a) => send(ws, { type: "tts_audio", data: a.toString("base64") }),
          onDone: () => {
            send(ws, { type: "tts_done" });
            ws.close();
          },
          onError: (e) => {
            send(ws, { type: "error", message: `TTS: ${e}` });
            ws.close();
          },
        });
        tts.start(msg.text || "").catch((e) => {
          send(ws, { type: "error", message: String(e) });
          ws.close();
        });
        if (!VOICE_API_KEY) send(ws, { type: "info", message: "TTS 降级模式（无 VOICE_API_KEY，无音频输出）" });
        return;
      }
      if (msg.type === "dialogue") {
        const asr = new VolcanoAsr(VOICE_API_KEY, {
          onPartial: (t) => send(ws, { type: "partial", text: t }),
          onFinal: (t) => {
            send(ws, { type: "final", text: t });
            pendingUserText = t;
            // 用户一句说完 → 触发 LLM（若当前没在播报，立即；否则排队在 tts_done 后）
            if (!session!.ttsSpeaking) runLlm(ws, session!, t);
          },
          onError: (e) => send(ws, { type: "error", message: e }),
          onClose: () => {},
        });
        asr.start().catch((e) => send(ws, { type: "error", message: String(e) }));
        session!.asr = asr;
        if (!VOICE_API_KEY) send(ws, { type: "info", message: "语音链路降级模式（无 VOICE_API_KEY）" });
        return;
      }
      send(ws, { type: "error", message: "未知会话类型" });
      return;
    }

    // --- 后续帧 ---
    if (msg.type === "audio" && typeof msg.data === "string") {
      const pcm = Buffer.from(msg.data, "base64");
      session.asr?.pushAudio(pcm);
      return;
    }
    if (msg.type === "end") {
      session.asr?.finish();
      return;
    }
    if (msg.type === "cancel") {
      // PTT 滑出取消：丢弃本句（降级模式无连接，仅清状态）
      pendingUserText = "";
      session.asr?.finish();
      return;
    }
  });

  ws.on("close", () => {
    session?.asr?.close();
  });
});

/** 触发 LLM 流式 + 串 TTS */
async function runLlm(ws: WebSocket, session: Session, userText: string) {
  session.ttsSpeaking = true;
  let full = "";
  await streamLlm(ARK_API_KEY, session.systemPrompt || "", userText, {
    onDelta: (d) => {
      full += d;
      send(ws, { type: "llm_delta", text: d });
    },
    onDone: (f) => {
      full = f;
      send(ws, { type: "llm_done", text: f });
      // LLM 完成 → 喂 TTS
      const tts = new VolcanoTts(VOICE_API_KEY, {
        onAudio: (a) => send(ws, { type: "tts_audio", data: a.toString("base64") }),
        onDone: () => {
          send(ws, { type: "tts_done" });
          session.ttsSpeaking = false;
          // 若取消后又来了新句，pendingUserText 已被清空，这里不重跑
        },
        onError: (e) => {
          send(ws, { type: "error", message: `TTS: ${e}` });
          session.ttsSpeaking = false;
        },
      });
      tts.start(full).catch((e) => {
        send(ws, { type: "error", message: String(e) });
        session.ttsSpeaking = false;
      });
    },
    onError: (e) => {
      send(ws, { type: "error", message: `LLM: ${e}` });
      session.ttsSpeaking = false;
    },
  });
}

console.log(`[voice-gateway] listening on ws://0.0.0.0:${PORT}`);
console.log(`[voice-gateway] VOICE_API_KEY=${VOICE_API_KEY ? "set" : "EMPTY(degraded)"} ARK_API_KEY=${ARK_API_KEY ? "set" : "EMPTY(degraded)"}`);
