import { NextRequest, NextResponse } from "next/server";
import { getReportFromSheets } from "@/lib/sheets";

export async function GET(_req: NextRequest, { params }: { params: { uuid: string } }) {
  const report = await getReportFromSheets(params.uuid);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(report);
}
