import { NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/ratelimit";
import { steamSearch } from "@/lib/search";

export async function GET(req: NextRequest) {
  if (await limited("steam-search", 20, 60)) return NextResponse.json({ error: "검색이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  const term = (req.nextUrl.searchParams.get("term") ?? "").trim().slice(0, 100);
  if (term.length < 2) return NextResponse.json({ hits: [] });
  return NextResponse.json({ hits: await steamSearch(term) });
}
