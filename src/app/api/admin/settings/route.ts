import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/admin-actions";
import { sql } from "@/lib/db";

const ALLOWED: Record<string, { label: string; min: number; max: number }> = {
  daily_limit: { label: "하루 분석 한도", min: 0, max: 500 },
  ai_monthly_call_cap: { label: "이번 달 AI 호출 상한", min: 0, max: 5000 },
};

/** 하루 분석 한도·AI 월 상한 변경. 저장하면 바로 적용됩니다. */
export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  const { key, value } = await req.json().catch(() => ({}));
  const def = ALLOWED[String(key)];
  const n = Number(value);
  if (!def) return NextResponse.json({ error: "알 수 없는 설정입니다." }, { status: 400 });
  if (!Number.isInteger(n) || n < def.min || n > def.max) return NextResponse.json({ error: `${def.label}은(는) ${def.min}~${def.max} 사이 정수로 입력해 주세요.` }, { status: 400 });
  await sql`insert into app_settings (key, value) values (${key}, ${String(n)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return NextResponse.json({ ok: true, message: `${def.label}을(를) ${n}(으)로 바꿨습니다.` });
}
