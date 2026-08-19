"use client";

import { useRef, useState } from "react";

/**
 * 语音输入按钮：点击开始录音 → 松开/再点停止 → ASR 转文字 → onText 回调。
 * 仅 secure context（HTTPS/localhost）可用（getUserMedia 限制），HTTP 下禁用并提示。
 */
export function VoiceInputButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const secure = typeof window !== "undefined" && window.isSecureContext;

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function stopAndRecognize() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    setBusy(true);
    const stopPromise = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await stopPromise;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    setRecording(false);
    try {
      const b64 = await blobToBase64(blob);
      if (b64.length < 200) {
        setError("录音太短，请再试一次");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/voice/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: b64, format: "webm" }),
      }).then((r) => r.json());
      if (res.ok && res.text) {
        onText(res.text);
        setError("");
      } else {
        setError(res.error ?? "语音识别失败");
      }
    } catch {
      setError("语音识别失败，请稍后重试");
    }
    setBusy(false);
  }

  async function toggle() {
    setError("");
    if (recording) {
      await stopAndRecognize();
      return;
    }
    if (disabled || busy) return;
    if (!secure) {
      setError("浏览器禁止在非 HTTPS 下录音，请通过 HTTPS 访问");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("无法访问麦克风（请检查浏览器授权）");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || busy}
        title={secure ? "语音输入" : "需 HTTPS 才能录音"}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition ${
          recording
            ? "animate-pulse bg-red-500 text-white"
            : "border border-zinc-300 bg-white text-zinc-600 hover:border-teal-400 hover:text-teal-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        }`}
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
        ) : recording ? (
          "⏺"
        ) : (
          "🎤"
        )}
      </button>
      {error && (
        <span className="max-w-[200px] text-right text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
