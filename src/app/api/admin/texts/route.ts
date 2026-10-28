import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/admin-actions";
import { sql } from "@/lib/db";
import { TEXT_DEFS } from "@/lib/text-defs";

export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  const { key, value, reset } = await req.json().catch(() => ({}));
  if (!TEXT_DEFS.some((t) => t.key === key)) return NextResponse.json({ error: "알 수 없는 문구입니다." }, { status: 400 });
  if (reset) {
    await sql`delete from ui_texts where key = ${key}`;
  } else {
    const v = String(value ?? "").trim();
    if (!v || v.length > 4000) return NextResponse.json({ error: v ? "문구가 너무 길어요. 4000자 이내로 줄여 주세요." : "빈 문구는 저장할 수 없어요. 기본 문구로 되돌리려면 '기본 문구로 되돌리기'를 눌러 주세요." }, { status: 400 });
    await sql`insert into ui_texts (key, value) values (${key}, ${v}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }
  revalidateTag("ui-texts");
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, message: reset ? "기본 문구로 되돌렸습니다." : "저장했습니다. 사이트에 바로 반영됩니다." });
}
