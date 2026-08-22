/**
 * 火山大模型流式 TTS 适配器（bidirection，WebSocket 双向流式）。
 *
 * 协议：wss://openspeech.bytedance.com/api/v3/plan/tts/bidirection
 *      客户端发送 start(JSON) + 文本帧；服务端流式返回音频（opus/mp3）。
 * 鉴权：header `X-Api-Key`。
 *
 * ⚠️ 无 VOICE_API_KEY 时降级：不连火山，收到文本后 emit 一个静音占位帧标志，
 *    让上层知道 TTS 阶段已完成（前端可据此结束「AI 播报中」状态）。联调时再实连。
 */

import WebSocket from "ws";

const TTS_WS_URL = "wss://openspeech.bytedance.com/api/v3/plan/tts/bidirection";
const RESOURCE_ID = "seed-tts-2.0"; // 流式大模型 TTS 资源 ID（联调时与控制台开通的 plan 核对）

export interface TtsHandlers {
  onAudio: (audio: Buffer) => void; // 一包流式音频
  onDone: () => void;
  onError: (err: string) => void;
}

export class VolcanoTts {
  private ws: WebSocket | null = null;
  private degraded: boolean;
  private handlers: TtsHandlers;
  private reqId = `gsc-tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  private speaker: string;

  constructor(
    private apiKey: string,
    handlers: TtsHandlers,
    speaker = "zh_female_gaolengyujie_uranus_bigtts",
  ) {
    this.degraded = !apiKey;
    this.handlers = handlers;
    this.speaker = speaker;
  }

  async start(text: string): Promise<void> {
    if (this.degraded) {
      this.handlers.onDone(); // 降级：直接标记完成
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(TTS_WS_URL, { headers: { "X-Api-Key": this.apiKey } });
      this.ws = ws;
      ws.on("open", () => {
        const startMsg = {
          app: { appid: "", token: "", cluster: "" },
          user: { uid: "gsc" },
          audio: { voice_type: this.speaker, encoding: "mp3", speed_ratio: 1.0, rate: 24000 },
          request: { reqid: this.reqId, operation: "submit", text },
          resource_id: RESOURCE_ID,
        };
        ws.send(JSON.stringify(startMsg));
        resolve();
      });
      ws.on("message", (data: any) => {
        // 服务端返回二进制音频包（或结束 JSON）
        if (Buffer.isBuffer(data) || Array.isArray(data)) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data);
          this.handlers.onAudio(buf);
        } else {
          try {
            const msg = JSON.parse(String(data));
            if (msg.code !== 1000 && msg.code !== 0) this.handlers.onError?.(msg.message);
            if (msg.code === 1000) this.handlers.onDone();
          } catch {
            /* 忽略 */
          }
        }
      });
      ws.on("error", (e: Error) => this.handlers.onError?.(String(e.message ?? e)));
      ws.on("close", () => this.handlers.onDone());
      ws.on("unexpected-response", (_r: unknown, resp: { statusCode?: number }) => reject(new Error(`TTS HTTP ${resp.statusCode}`)));
    });
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
  }
}
