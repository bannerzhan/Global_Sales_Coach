import { NextRequest, NextResponse } from "next/server";
import { tts } from "@/lib/llm/voice";

/** POST /api/voice/tts  { text } → { ok, audioBase64?, format?, error? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = body?.text;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "缺少 text" }, { status: 400 });
  }
  const res = await tts(text);
  return NextResponse.json(res, res.ok ? { status: 200 } : { status: 400 });
}
