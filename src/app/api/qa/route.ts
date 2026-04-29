import { NextRequest, NextResponse } from "next/server";
import { getReportFromSheets, appendQAToSheet } from "@/lib/sheets";
import { askFollowupQuestion } from "@/lib/gemini";
import { randomUUID } from "crypto";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { uuid, question } = await req.json() as { uuid: string; question: string };
  const report = await getReportFromSheets(uuid);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  const { answer, error } = await askFollowupQuestion(report.ai_data, question);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const qaUuid = randomUUID();
  const askedAt = new Date().toISOString();

  // 시트에 비동기 저장 — 저장 실패가 응답을 막지 않도록 non-blocking
  appendQAToSheet(qaUuid, uuid, report.app_id, report.game_name, askedAt, question, answer ?? "")
    .catch((err) => console.error("[qa] Failed to save QA to sheets:", err));

  return NextResponse.json({ answer, qa_uuid: qaUuid, asked_at: askedAt });
}
