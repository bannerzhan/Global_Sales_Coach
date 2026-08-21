import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { translateText } from "@/lib/llm/translate";

/**
 * POST /api/translate  { text } → { ok, translation?, direction?, error? }
 * 鉴权：未登录拒绝。翻译走 flash 档并记 ai_runs 成本账本。
 * 文本长度上限 4000，避免异常大请求。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text = body?.text;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "缺少待翻译文本" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ ok: false, error: "文本过长（上限 4000 字符）" }, { status: 400 });
  }

  const res = await translateText(text, session.user.id);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    translation: res.translation,
    direction: res.direction,
  });
}
