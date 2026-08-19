import { NextRequest, NextResponse } from "next/server";
import { asr } from "@/lib/llm/voice";

/** POST /api/voice/asr  { audioBase64, format? } → { ok, text?, error? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const audioBase64 = body?.audioBase64;
  if (!audioBase64 || typeof audioBase64 !== "string") {
    return NextResponse.json({ ok: false, error: "缺少 audioBase64" }, { status: 400 });
  }
  const res = await asr(audioBase64, body?.format ?? "wav");
  return NextResponse.json(res, res.ok ? { status: 200 } : { status: 400 });
}
