"use client";

/**
 * 浏览器端语音网关客户端。
 *
 * 直接连 Caddy 反代的 WebSocket 路径（wss://host/voice-ws），不经过 Next route.ts
 * （Next 16 Turbopack 不支持原生 WS upgrade）。网关独立进程在 8787，Caddy 负责转发。
 *
 * 职责：
 *  - 连接网关，发 dialogue/transcribe 首帧
 *  - 用 Web Audio API 采集麦克风 → 16k 单声道 PCM → 每 ~40ms 分包 base64 推给网关
 *  - PTT（按住说话）：松开=end，滑出取消=cancel
 *  - 回调：onPartial / onFinal / onLlmDelta / onLlmDone / onTtsAudio / onTtsDone / onError
 */

export type VoiceSessionType = "transcribe" | "dialogue";

export interface VoiceCallbacks {
  onPartial?: (t: string) => void;
  onFinal?: (t: string) => void;
  onLlmDelta?: (t: string) => void;
  onLlmDone?: (t: string) => void;
  onTtsAudio?: (b64: string) => void;
  onTtsDone?: (() => void) | undefined;
  onError?: (e: string) => void;
  onInfo?: (m: string) => void;
}

function gatewayUrl(): string {
  // 同源：https 页 → wss，http → ws；路径由 Caddy 反代到网关 8787
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/voice-ws`;
}

function pcm16FromFloat32(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private connected = false;
  private callbacks: VoiceCallbacks;

  constructor(cb: VoiceCallbacks) {
    this.callbacks = cb;
  }

  async connect(type: VoiceSessionType, systemPrompt = ""): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(gatewayUrl());
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        ws.send(JSON.stringify({ type, systemPrompt }));
        resolve();
      };
      ws.onerror = () => reject(new Error("语音网关连接失败"));
      ws.onmessage = (ev) => this.onMessage(ev.data);
      ws.onclose = () => {
        this.connected = false;
      };
    });
  }

  private onMessage(data: string) {
    let m: any;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    switch (m.type) {
      case "info": this.callbacks.onInfo?.(m.message); break;
      case "partial": this.callbacks.onPartial?.(m.text); break;
      case "final": this.callbacks.onFinal?.(m.text); break;
      case "llm_delta": this.callbacks.onLlmDelta?.(m.text); break;
      case "llm_done": this.callbacks.onLlmDone?.(m.text); break;
      case "tts_audio": this.callbacks.onTtsAudio?.(m.data); break;
      case "tts_done": this.callbacks.onTtsDone?.(); break;
      case "error": this.callbacks.onError?.(m.message); break;
    }
  }

  /** 开始采集麦克风并推流（PTT 按住） */
  async startCapture(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    const src = this.audioCtx.createMediaStreamSource(this.stream);
    // ScriptProcessor 兼容性最好；AudioWorklet 另议
    const proc = this.audioCtx.createScriptProcessor(1024, 1, 1);
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = pcm16FromFloat32(input);
      const b64 = this.arrayBufferToBase64(pcm.buffer as ArrayBuffer);
      this.send({ type: "audio", data: b64 });
    };
    src.connect(proc);
    proc.connect(this.audioCtx.destination);
    this.source = src;
    this.processor = proc;
  }

  /** PTT 松开：本句结束 */
  endUtterance(): void {
    this.send({ type: "end" });
  }

  /** PTT 滑出：取消本句 */
  cancelUtterance(): void {
    this.send({ type: "cancel" });
  }

  stopCapture(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.processor?.disconnect(); this.source?.disconnect(); } catch {}
    this.audioCtx?.close().catch(() => {});
    this.stream = null;
    this.audioCtx = null;
    this.processor = null;
    this.source = null;
  }

  disconnect(): void {
    this.stopCapture();
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  private send(obj: unknown) {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
    }
    return btoa(binary);
  }
}
