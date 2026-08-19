"use client";

import { useRef, useState } from "react";

/**
 * AI 回复朗读：优先浏览器原生 TTS（speechSynthesis，免费无 key 国内可用），
 * 失败/不可用时回退服务端火山 TTS（/api/voice/tts，需 VOICE_API_KEY）。
 */
export function VoicePlayButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** 原生 TTS；返回 false 表示不可用 */
  function speakNative(): boolean {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const isZh = /[\u4e00-\u9fff]/.test(text);
    const voices = synth.getVoices();
    const v =
      voices.find((x) => x.lang.toLowerCase().startsWith(isZh ? "zh" : "en")) ??
      voices.find((x) => x.lang.toLowerCase().startsWith(isZh ? "en" : "zh")) ??
      voices[0];
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    synth.speak(u);
    return true;
  }

  async function toggle() {
    setError("");
    if (playing) {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (disabled || busy) return;

    // 1) 原生 TTS（立即可用）
    if (speakNative()) {
      setPlaying(true);
      return;
    }
    // 2) 服务端火山 TTS（配置了 VOICE_API_KEY 时）
    setBusy(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (!res.ok || !res.audioBase64) {
        setError(res.error ?? "语音合成失败");
        return;
      }
      const a = audioRef.current ?? new Audio();
      audioRef.current = a;
      a.src = `data:audio/mpeg;base64,${res.audioBase64}`;
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setPlaying(false);
        setError("播放失败");
      };
      await a.play();
      setPlaying(true);
    } catch {
      setError("语音合成失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || busy}
        className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition disabled:opacity-40 ${
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
