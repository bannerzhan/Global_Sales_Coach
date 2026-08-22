/**
 * 火山大模型流式 ASR 适配器（bigmodel_async）。
 *
 * 协议：WebSocket + 自定义 GIP 二进制帧（见 protocol/gip.ts）。
 * 鉴权：连接 URL 带 query（appkey/token 已废弃，新版走 X-Api-Key header 或 token query）。
 *      这里按当前通用做法：wss URL + header `X-Api-Key`，audio 帧按 GIP 发送，
 *      start/finish 控制消息走 JSON over GIP。
 *
 * ⚠️ 无 VOICE_API_KEY 时进入「降级模式」：不连火山，收到音频后直接 emit 占位文本，
 *    让上层（server）能验证整条 WS 链路、前端 PTT/字幕 UI 不卡死。等你填 key 后联调。
 */

import WebSocket from "ws";
import * as zlib from "node:zlib";
import { encodeAudioFrame, encodeControlFrame } from "../protocol/gip";

const ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
const RESOURCE_ID = "volc.bigasr.sauc.async"; // 流式大模型 ASR 资源 ID

export interface AsrHandlers {
  onPartial?: (text: string) => void; // 中间结果
  onFinal?: (text: string) => void; // 最终结果
  onError?: (err: string) => void;
  onClose?: () => void;
}

export class VolcanoAsr {
  private ws: WebSocket | null = null;
  private seq = 0;
  private degraded: boolean;
  private handlers: AsrHandlers;
  private resourceId: string;
  private appId: string;
  private cluster: string;
  private lang: string;
  private reqId = `gsc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  constructor(
    private apiKey: string,
    handlers: AsrHandlers,
    opts: { resourceId?: string; appId?: string; cluster?: string; lang?: string } = {},
  ) {
    this.degraded = !apiKey;
    this.handlers = handlers;
    this.resourceId = opts.resourceId || RESOURCE_ID;
    this.appId = opts.appId || "";
    this.cluster = opts.cluster || "";
    this.lang = opts.lang || "en";
  }

  /** 建立连接并发送 start 控制消息 */
  async start(): Promise<void> {
    if (this.degraded) {
      // 降级：不连火山，等待前端音频包后模拟返回
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(ASR_WS_URL, {
        headers: { "X-Api-Key": this.apiKey },
      });
      this.ws = ws;
      ws.on("open", () => {
        const startMsg = {
          app: { appid: this.appId, token: "", cluster: this.cluster },
          user: { uid: "gsc" },
          audio: { format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1 },
          request: { reqid: this.reqId, workflow: "audio_in,language_recognition" },
          resource_id: this.resourceId,
          language: this.lang,
        };
        ws.send(encodeControlFrame(startMsg, this.seq++, (b) => zlib.gzipSync(b)));
        resolve();
      });
      ws.on("message", (data: any) => this.onMessage(data));
      ws.on("error", (e: Error) => this.handlers.onError?.(String(e.message ?? e)));
      ws.on("close", () => this.handlers.onClose?.());
      ws.on("unexpected-response", (_r: unknown, resp: { statusCode?: number }) =>
        reject(new Error(`ASR HTTP ${resp.statusCode}`)),
      );
    });
  }

  /** 推一包 16k 单声道 PCM */
  pushAudio(pcm: Buffer): void {
    if (this.degraded) return; // 降级模式不发送
    this.ws?.send(encodeAudioFrame(pcm, this.seq++));
  }

  /** 发送结束控制消息并等待最终结果 */
  async finish(): Promise<void> {
    if (this.degraded) {
      // 降级：返回一个占位最终结果，便于链路验证
      this.handlers.onFinal?.("[降级] 未配置 VOICE_API_KEY，ASR 不可用");
      this.handlers.onClose?.();
      return;
    }
    const finishMsg = { type: "finish", data: { reqid: this.reqId } };
    this.ws?.send(encodeControlFrame(finishMsg, this.seq++, (b) => zlib.gzipSync(b)));
    // 给服务端一点时间回最终结果，然后关连接
    setTimeout(() => this.ws?.close(), 500);
  }

  private onMessage(data: WebSocket.RawData): void {
    // 服务端返回文本帧（JSON 字符串）
    let raw: string;
    if (Buffer.isBuffer(data)) raw = data.toString("utf8");
    else if (Array.isArray(data)) raw = Buffer.concat(data).toString("utf8");
    else raw = String(data);
    try {
      const msg = JSON.parse(raw);
      // 火山返回结构：{ code, message, result, payload? }
      if (msg.code !== 1000 && msg.code !== 0) {
        this.handlers.onError?.(msg.message ?? `ASR code ${msg.code}`);
        return;
      }
      if (msg.result) {
        // result 含 text / utt 等，最终/中间以 is_final 或 type 区分
        const isFinal = msg.is_final ?? msg.type === "finish";
        if (isFinal) this.handlers.onFinal?.(msg.result);
        else this.handlers.onPartial?.(msg.result);
      }
    } catch {
      // 非 JSON（极少数二进制音频回包）忽略
    }
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
