import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { reapStuck } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** 진행 화면이 몇 초마다 부르는 가벼운 상태 조회 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "잘못된 주소입니다." }, { status: 400 });
  await reapStuck().catch(() => 0);
  const [r] = await sql`select status, step, error from analyses where id = ${id}`;
  if (!r) return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
