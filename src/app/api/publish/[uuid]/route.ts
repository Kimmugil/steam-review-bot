import { NextRequest, NextResponse } from "next/server";
import { getReportFromSheets, updateNotionStatus } from "@/lib/sheets";
import { uploadToNotion } from "@/lib/notion";

const NOTION_PUBLIC_URL = process.env.NOTION_PUBLIC_URL ?? "https://www.notion.so/";

export async function POST(_req: NextRequest, { params }: { params: { uuid: string } }) {
  const report = await getReportFromSheets(params.uuid);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  const pageId = await uploadToNotion({
    appId: report.app_id,
    gameName: report.game_name,
    releaseDate: report.release_date,
    storeStats: report.store_stats,
    aiData: report.ai_data,
    recentLabel: report.recent_label,
    smartReason: report.smart_reason,
    newsData: report.news_data,
    qaHistory: report.qa_history,
  });

  if (!pageId) return NextResponse.json({ error: "노션 발행에 실패했습니다." }, { status: 500 });

  const hyphenated = pageId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  const notionUrl = `${NOTION_PUBLIC_URL}${hyphenated.replace(/-/g, "")}`;

  await updateNotionStatus(params.uuid, pageId, notionUrl);

  return NextResponse.json({ page_id: pageId, notion_url: notionUrl });
}
