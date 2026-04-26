import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { analyzeWithGemini } from "@/lib/gemini";
import { saveAnalysisToSheets } from "@/lib/sheets";
import type { StoreStats, NewsData, AnalysisReport } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    appId: string;
    gameName: string;
    headerImage: string;
    releaseDate: string;
    recentLabel: string;
    smartReason: string;
    storeStats: StoreStats;
    filteredAll: Record<string, string[]>;
    filteredRecent: Record<string, string[]>;
    newsData: NewsData;
    feedback?: string;
  };

  const {
    appId, gameName, headerImage, releaseDate,
    recentLabel, smartReason, storeStats,
    filteredAll, filteredRecent, newsData, feedback,
  } = body;

  // Gemini 분석
  const { insights, error: aiError } = await analyzeWithGemini(
    gameName, filteredAll, filteredRecent, storeStats, recentLabel, newsData, feedback
  );
  if (aiError || !insights) {
    return NextResponse.json(
      { error: aiError ?? "AI 분석에 실패했습니다." },
      { status: 500 }
    );
  }

  // UUID 발급 + Google Sheets 저장
  const uuid = uuidv4();
  const report: AnalysisReport = {
    uuid,
    app_id: appId,
    game_name: gameName,
    release_date: releaseDate,
    header_image: headerImage,
    recent_label: recentLabel,
    smart_reason: smartReason,
    store_stats: storeStats,
    ai_data: insights,
    news_data: newsData,
    qa_history: [],
    analysis_time: new Date().toISOString(),
    notion_published: false,
    notion_url: null,
  };

  await saveAnalysisToSheets(report);

  return NextResponse.json({ uuid });
}
