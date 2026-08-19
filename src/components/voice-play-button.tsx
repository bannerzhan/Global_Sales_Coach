"use client";

import { useRef, useState } from "react";

/**
 * 语音播放按钮：TTS 合成 AI 回复并播放（mp3 data URL）。
 * 点击播放 / 再点停止；HTTP（非 secure context）下也允许（播放不受限，仅录音受限）。
 */
export function VoicePlayButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function toggle() {
    setError("");
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (disabled || busy) return;
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
