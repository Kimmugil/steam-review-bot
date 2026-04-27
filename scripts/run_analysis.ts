import { v4 as uuidv4 } from "uuid";
import { getSteamGameInfo, fetchLatestNews, getSmartPeriod, fetchSteamReviews } from "../src/lib/steam";
import { saveAnalysisToSheets, updateQueueStatus } from "../src/lib/sheets";
import type { AnalysisReport } from "../src/lib/types";

async function main() {
  const appId = process.argv[2];
  const uuid = process.argv[3] || uuidv4();

  if (!appId) {
    console.error("Usage: tsx scripts/run_analysis.ts <appId> [uuid]");
    process.exit(1);
  }

  console.log(`Starting analysis for appId: ${appId}, uuid: ${uuid}`);

  try {
    // 1) 게임 기본 정보
    const gameInfo = await getSteamGameInfo(appId);
    if (!gameInfo) {
      throw new Error(`Invalid App ID or failed to fetch game info for ${appId}`);
    }

    // 2) 스마트 기간 계산
    const { days, label, reason, periodStr } = getSmartPeriod(gameInfo.releaseDate);

    // 3) 뉴스 + 리뷰 수집
    console.log("Fetching news and reviews...");
    const [newsData, reviewResult] = await Promise.all([
      fetchLatestNews(appId),
      fetchSteamReviews(appId, days, gameInfo.releaseDate, periodStr),
    ]);

    const { filteredAll, filteredRecent, storeStats, actualRecentLabel } = reviewResult;

    const report: AnalysisReport = {
      uuid,
      app_id: appId,
      game_name: gameInfo.gameName,
      release_date: gameInfo.releaseDate.toISOString().slice(0, 10),
      header_image: gameInfo.headerImage,
      recent_label: actualRecentLabel ?? label,
      smart_reason: reason,
      store_stats: storeStats,
      news_data: newsData,
      ai_data: null, // No AI data yet (assumed done later or skipped)
      qa_history: [],
      analysis_time: new Date().toISOString(),
      notion_published: false,
      notion_url: null,
    };

    // 4) 구글 시트에 적재
    console.log("Saving to Google Sheets...");
    await saveAnalysisToSheets(report);

    // 5) 큐 상태 업데이트
    console.log("Updating Queue status to COMPLETED...");
    await updateQueueStatus(uuid, "COMPLETED");

    console.log("Analysis completed successfully!");
  } catch (error) {
    console.error("Analysis failed:", error);
    try {
      await updateQueueStatus(uuid, "ERROR");
    } catch (qError) {
      console.error("Failed to update queue status:", qError);
    }
    process.exit(1);
  }
}

main();
