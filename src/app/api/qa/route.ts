import { NextRequest, NextResponse } from "next/server";
import { getReportFromSheets } from "@/lib/sheets";
import { askFollowupQuestion } from "@/lib/gemini";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { uuid, question } = await req.json() as { uuid: string; question: string };
  const report = await getReportFromSheets(uuid);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  const { answer, error } = await askFollowupQuestion(report.ai_data, question);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ answer });
}
