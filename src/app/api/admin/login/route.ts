import { NextRequest, NextResponse } from "next/server";
import { clientKey, isLocked, makeToken, recordAttempt, sessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.SESSION_SECRET)
    return NextResponse.json({ error: "관리자 비밀번호가 아직 설정되지 않았습니다. (ADMIN_PASSWORD_HASH, SESSION_SECRET 환경변수)" }, { status: 500 });
  let key: string;
  try {
    key = await clientKey();
    if (await isLocked(key)) return NextResponse.json({ error: "로그인에 여러 번 실패해 15분 동안 잠겼습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "데이터베이스에 연결하지 못했습니다. Vercel 환경변수(DATABASE_URL)를 확인해 주세요. 점검 주소: /api/health" }, { status: 500 });
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const ok = typeof password === "string" && password.length > 0 && verifyPassword(password);
  try { await recordAttempt(key, ok); } catch { /* 기록 실패는 로그인 판정에 영향 없음 */ }
  if (!ok) return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  const { token, maxAge } = makeToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie.name, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
  return res;
}
