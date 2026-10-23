import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/admin-actions";
import { sql } from "@/lib/db";
import { dispatchAnalysis } from "@/lib/github";
import { createRequest, markFailed, reapStuck } from "@/lib/repo";
import { getGameInfo, notAnalyzableReason } from "@/lib/steam";

export const maxDuration = 30;

/** 관리자 분석 관리: 숨기기·보이기·삭제·멈춘 분석 정리·다시 분석(한도 소모 없음) */
export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; appId?: number };
  const isId = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id);

  if (b.action === "reap") {
    const n = await reapStuck();
    return NextResponse.json({ ok: true, message: n ? `멈춰 있던 분석 ${n}건을 실패로 정리했습니다.` : "멈춘 분석이 없습니다." });
  }
  if (b.action === "rerun") {
    const info = await getGameInfo(Number(b.appId)).catch(() => null);
    if (!info || notAnalyzableReason(info)) return NextResponse.json({ error: info ? notAnalyzableReason(info) : "스팀에서 분석할 수 있는 게임을 찾지 못했습니다." }, { status: 400 });
    const r = await createRequest({ appId: info.appId, name: info.name, headerImage: info.headerImage, releaseDate: info.releaseDate?.toISOString().slice(0, 10) ?? null, via: "admin", requesterHash: null });
    if (r.kind === "active") return NextResponse.json({ ok: false, message: "이 게임은 이미 분석이 진행 중입니다." });
    if (r.kind !== "created") return NextResponse.json({ error: "접수하지 못했습니다." }, { status: 500 });
    const d = await dispatchAnalysis(r.id);
    if (!d.ok) { await markFailed(r.id, d.message); return NextResponse.json({ ok: false, message: d.message }, { status: 502 }); }
    return NextResponse.json({ ok: true, message: `${info.name} 분석을 시작했습니다. 1~3분 걸립니다.`, id: r.id });
  }
  if (!isId) return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 400 });

  if (b.action === "hide" || b.action === "show") {
    await sql`update analyses set hidden = ${b.action === "hide"} where id = ${b.id!}`;
  } else if (b.action === "delete") {
    await sql`delete from analyses where id = ${b.id!}`;
  } else if (b.action === "fail") {
    await markFailed(b.id!, "관리자가 중단했습니다.");
  } else {
    return NextResponse.json({ error: "알 수 없는 작업입니다." }, { status: 400 });
  }
  revalidatePath("/");
  return NextResponse.json({ ok: true, message: "처리했습니다." });
}
