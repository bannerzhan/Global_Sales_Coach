// 火山语音技术（独立产品线：openspeech.bytedance.com，与方舟 ARK chat API 不同线）
// - ASR：大模型录音文件极速版识别（X-Api-Resource-Id: volc.bigasr.auc_turbo）
// - TTS：大模型语音合成 HTTP 单次（X-Api-Resource-Id: seed-tts-2.0）
// 鉴权：X-Api-Key = 火山语音控制台 API Key（VOICE_API_KEY，非 ARK key）
import { env } from "../env";

const ASR_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const TTS_URL = "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional";

// 语音 key 等走运行时 process.env 优先（Next build 会固化 env.ts 值，
// 动态读取让部署后改 key 只重启容器、不必 rebuild）
function voiceEnv(key: keyof typeof env): string {
  return (process.env[key] ?? env[key]) ?? "";
}

export interface AsrResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** 语音 → 文字（base64 音频，16k 单声道 wav 最佳；极速版支持多种格式） */
export async function asr(audioBase64: string, format = "wav"): Promise<AsrResult> {
  const key = voiceEnv('VOICE_API_KEY');
  if (!key) return { ok: false, error: "语音服务未配置（VOICE_API_KEY）" };
  try {
    const res = await fetch(ASR_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": key,
        "X-Api-Resource-Id": voiceEnv('VOICE_ASR_RESOURCE_ID'),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app: { appid: "", token: "", cluster: "" },
        user: { uid: "gsc" },
        request: {
          reqid: `gsc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          model_name: "bigmodel",
          workflow: "",
          audio: { format, data: audioBase64 },
          recognition: {},
        },
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.result) return { ok: true, text: data.result };
    return { ok: false, error: data?.message ?? `ASR 失败 HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface TtsResult {
  ok: boolean;
  audioBase64?: string;
  format?: string;
  error?: string;
}

/** 文字 → 语音（mp3 base64；音色由 VOICE_TTS_SPEAKER 控制） */
export async function tts(text: string): Promise<TtsResult> {
  const key = voiceEnv('VOICE_API_KEY');
  if (!key) return { ok: false, error: "语音服务未配置（VOICE_API_KEY）" };
  if (!text.trim()) return { ok: false, error: "文本为空" };
  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": key,
        "X-Api-Resource-Id": voiceEnv('VOICE_TTS_RESOURCE_ID'),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        req_params: {
          text,
          speaker: voiceEnv('VOICE_TTS_SPEAKER'),
          audio_params: { format: "mp3", sample_rate: 24000 },
        },
      }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 0 && (res.ok || contentType.includes("audio"))) {
      return { ok: true, audioBase64: buf.toString("base64"), format: "mp3" };
    }
    const data = JSON.parse(buf.toString("utf8") || "{}");
    return { ok: false, error: data?.message ?? `TTS 失败 HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
