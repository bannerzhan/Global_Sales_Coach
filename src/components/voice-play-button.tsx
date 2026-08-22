"use client";

import { useRef, useState } from "react";
import { VoiceClient } from "@/lib/voice-client";

/**
 * AI 回复朗读：连后端 WS 语音网关的 tts 会话（纯文字→音频流），
 * 替代原浏览器原生 speechSynthesis（音色/语气不可控、中文生硬）。
 * 音频流（mp3 base64 包）边收边播；AI 播报中按钮置灰，避免重叠。
 */
export function VoicePlayButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBuffer[]>([]);
  const playingRef = useRef(false);

  async function playMp3(base64: string) {
    const ctx = audioCtxRef.current!;
    const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const audioBuf = await ctx.decodeAudioData(buf.buffer.slice(0));
    queueRef.current.push(audioBuf);
    if (!playingRef.current) drain();
  }

  function drain() {
    const ctx = audioCtxRef.current!;
    const next = queueRef.current.shift();
    if (!next) {
      playingRef.current = false;
      return;
    }
    playingRef.current = true;
    const src = ctx.createBufferSource();
    src.buffer = next;
    src.onended = () => drain();
    src.connect(ctx.destination);
    src.start();
  }

  async function toggle() {
    setError("");
    if (playing || busy) {
      // 停止
      queueRef.current = [];
      playingRef.current = false;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setPlaying(false);
      return;
    }
    if (disabled) return;
    setBusy(true);
    try {
      audioCtxRef.current = new AudioContext();
      const client = new VoiceClient({
        onTtsAudio: (b64) => playMp3(b64),
        onTtsDone: () => {
          setPlaying(false);
          setBusy(false);
        },
        onError: (e) => {
          setError(e);
          setBusy(false);
          setPlaying(false);
        },
      });
      // 连网关 tts 会话并发送文本
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          location.protocol === "https:" ? "wss://" + location.host + "/voice-ws" : "ws://" + location.host + "/voice-ws",
        );
        (client as any).ws = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "tts", text }));
          resolve();
        };
        ws.onerror = () => reject(new Error("语音网关连接失败"));
        ws.onmessage = (ev) => {
          let m: any;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (m.type === "tts_audio") playMp3(m.data);
          else if (m.type === "tts_done") { setPlaying(false); setBusy(false); ws.close(); }
          else if (m.type === "error") { setError(m.message); setBusy(false); setPlaying(false); }
        };
      });
      setPlaying(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition ${
          playing
            ? "bg-teal-600 text-white"
            : "border border-zinc-300 bg-white text-zinc-600 hover:border-teal-400 hover:text-teal-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {busy ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
        ) : playing ? (
          "⏹ 停止"
        ) : (
          "🔊 朗读"
        )}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
