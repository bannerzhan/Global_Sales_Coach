"use client";

import { useRef, useState } from "react";
import { VoiceClient } from "@/lib/voice-client";

/**
 * 语音输入（PTT 按住说话）：
 *  - 连接后端 WS 语音网关（/voice-ws，Caddy 反代到独立网关进程 8787）
 *  - 按住录音 → 16k 单声道 PCM 实时推流 → 网关 ASR 识别 → onText 回调最终文本
 *  - 松手=本句结束；按住滑出按钮外再松=取消本句（不提交）
 *  - 不再使用浏览器端 Whisper（合规：音频不出端、密钥在后端）
 *
 * systemPrompt 用于把销售教练人设/客户档案注入 LLM（dialogue 模式下 AI 会语音回复）。
 * 若只需纯转文字（transcribe），传 useDialogue=false。
 */
export function VoiceInputButton({
  onText,
  disabled,
  systemPrompt,
  useDialogue = false,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  systemPrompt?: string;
  useDialogue?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const clientRef = useRef<VoiceClient | null>(null);
  const cancelingRef = useRef(false);

  const secure = typeof window !== "undefined" && window.isSecureContext;

  async function start() {
    setError("");
    if (disabled || busy) return;
    if (!secure) {
      setError("浏览器禁止在非 HTTPS 下录音，请通过 https 访问");
      return;
    }
    try {
      setBusy(true);
      setStatus("连接语音服务…");
      const client = new VoiceClient({
        onFinal: (t) => {
          if (!cancelingRef.current && t && !t.startsWith("[降级]")) {
            onText(t);
          }
        },
        onError: (e) => setError(e),
        onInfo: (m) => setStatus(m),
      });
      await client.connect(useDialogue ? "dialogue" : "transcribe", systemPrompt);
      clientRef.current = client;
      await client.startCapture();
      setRecording(true);
      setBusy(false);
      setStatus("说话中…（松手发送，滑出取消）");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setRecording(false);
    }
  }

  function stop(send: boolean) {
    const client = clientRef.current;
    if (!client) return;
    if (send) client.endUtterance();
    else client.cancelUtterance();
    client.stopCapture();
    clientRef.current = null;
    setRecording(false);
    setStatus("");
  }

  // 按住
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    cancelingRef.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start();
  }
  // 移动：滑出按钮区域 → 取消
  function onPointerMove(e: React.PointerEvent) {
    if (!recording) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const outside =
      e.clientX < rect.left - 8 || e.clientX > rect.right + 8 ||
      e.clientY < rect.top - 8 || e.clientY > rect.bottom + 8;
    cancelingRef.current = outside;
    setStatus(outside ? "松手取消…" : "说话中…（松手发送，滑出取消）");
  }
  function onPointerUp() {
    if (!recording) return;
    stop(!cancelingRef.current);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => recording && (cancelingRef.current = true)}
        disabled={disabled || busy}
        title={secure ? "按住说话" : "需 HTTPS 才能录音"}
        className={`flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl text-lg transition ${
          recording
            ? cancelingRef.current
              ? "bg-zinc-400 text-white"
              : "animate-pulse bg-red-500 text-white"
            : "border border-zinc-300 bg-white text-zinc-600 hover:border-teal-400 hover:text-teal-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        }`}
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
        ) : recording ? (
          "🎙"
        ) : (
          "🎤"
        )}
      </button>
      {busy && !recording && <span className="text-xs text-teal-600">{status}</span>}
      {recording && <span className="max-w-[200px] text-right text-xs text-teal-600">{status}</span>}
      {error && <span className="max-w-[220px] text-right text-xs text-red-500">{error}</span>}
    </div>
  );
}
