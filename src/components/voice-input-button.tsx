"use client";

import { useRef, useState } from "react";

/**
 * 语音输入：MediaRecorder 录音 → 本地 Whisper（transformers.js，浏览器内推理，
 * 免费无 key、国内可用、隐私好）→ 失败兜底服务端火山 ASR（/api/voice/asr）。
 * 模型从 hf-mirror.com 镜像加载（Xenova/whisper-base，约 40MB，首次加载缓存）。
 * 仅 secure context（HTTPS/localhost）可用（getUserMedia 限制）。
 */

// Whisper 单例（跨组件复用，避免重复下载/加载模型）
let whisperPipeline: any = null;
let whisperLoading: Promise<any> | null = null;

async function loadWhisper() {
  if (whisperPipeline) return whisperPipeline;
  if (!whisperLoading) {
    whisperLoading = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      // 国内镜像（huggingface.co 被墙）
      env.remoteHost = "https://hf-mirror.com";
      whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-base");
      return whisperPipeline;
    })().catch((e) => {
      whisperLoading = null;
      throw e;
    });
  }
  return whisperLoading;
}

export function VoiceInputButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); // 识别中/加载模型中…
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

  async function recognize(blob: Blob) {
    // 1) 本地 Whisper（免费稳定）
    setStatus("加载语音模型…");
    try {
      const asr = await loadWhisper();
      setStatus("识别中…");
      const out = await asr(blob, { task: "transcribe" });
      const text = (out?.text ?? "").trim();
      if (text) {
        onText(text);
        setStatus("");
        return;
      }
      setStatus("");
      setError("没听清，请再试一次");
      return;
    } catch (e) {
      console.warn("[voice] 本地 Whisper 失败，回退火山 ASR:", (e as Error).message);
    }
    // 2) 兜底：火山 ASR（配置 VOICE_API_KEY 时）
    setStatus("服务端识别中…");
    try {
      const b64 = await blobToBase64(blob);
      const res = await fetch("/api/voice/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: b64, format: "webm" }),
      }).then((r) => r.json());
      if (res.ok && res.text) {
        onText(res.text);
        setStatus("");
      } else {
        setStatus("");
        setError(res.error ?? "语音识别不可用（本地模型加载失败且未配置语音服务）");
      }
    } catch {
      setStatus("");
      setError("语音识别失败，请稍后重试");
    }
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
    if (blob.size < 1000) {
      setError("录音太短，请再试一次");
      setBusy(false);
      return;
    }
    await recognize(blob);
    setBusy(false);
  }

  async function toggle() {
    setError("");
    setStatus("");
    if (recording) {
      await stopAndRecognize();
      return;
    }
    if (disabled || busy) return;
    if (!secure) {
      setError("浏览器禁止在非 HTTPS 下录音，请通过 https://82.157.183.237:3443 访问");
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
      {busy && <span className="text-xs text-teal-600">{status}</span>}
      {error && (
        <span className="max-w-[220px] text-right text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
