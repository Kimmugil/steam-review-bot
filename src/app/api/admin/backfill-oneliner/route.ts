import { NextResponse } from "next/server";
import { backfillOneLiner, getConfig } from "@/lib/sheets";

export async function POST(req: Request) {
  // 관리자 비밀번호 확인
  const { password } = await req.json().catch(() => ({}));
  const config = await getConfig();
  if (password !== config["admin_password"]) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await backfillOneLiner();
  return NextResponse.json({ ok: true, ...result });
}
