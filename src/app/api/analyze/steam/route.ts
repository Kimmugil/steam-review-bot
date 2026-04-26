import { NextRequest, NextResponse } from "next/server";
import { getSteamGameInfo, fetchLatestNews, getSmartPeriod, fetchSteamReviews } from "@/lib/steam";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { appId } = await req.json() as { appId: string };

  // 1) 게임 기본 정보
  const gameInfo = await getSteamGameInfo(appId);
  if (!gameInfo) {
    return NextResponse.json(
      { error: "유효한 App ID 또는 스팀 상점 주소를 입력해 주세요." },
      { status: 400 }
    );
  }

  // 2) 스마트 기간 계산
  const { days, label, reason, periodStr } = getSmartPeriod(gameInfo.releaseDate);

  // 3) 뉴스 + 리뷰 병렬 수집
  const [newsData, reviewResult] = await Promise.all([
    fetchLatestNews(appId),
    fetchSteamReviews(appId, days, gameInfo.releaseDate, periodStr),
  ]);

  const { filteredAll, filteredRecent, storeStats, actualRecentLabel } = reviewResult;

  return NextResponse.json({
    gameName: gameInfo.gameName,
    headerImage: gameInfo.headerImage,
    releaseDate: gameInfo.releaseDate.toISOString().slice(0, 10),
    // A+C로 수집이 잘린 경우 실제 수집된 기간 레이블로 교체
    recentLabel: actualRecentLabel ?? label,
    smartReason: reason,
    storeStats,
    filteredAll,
    filteredRecent,
    newsData,
  });
}
