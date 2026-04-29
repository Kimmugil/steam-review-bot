import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password: string };
  const config = await getConfig();
  const adminPassword = config.admin_password ?? "admin1234";
  if (password !== adminPassword) {
    return NextResponse.json({ error: "비밀번호가 틀렸습니다." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
