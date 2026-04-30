import { NextRequest, NextResponse } from "next/server";
import { getSteamGameInfo } from "@/lib/steam";
import { addAnalysisToQueue, getDailyUsage, incrementDailyUsage, getConfig } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { appId } = await req.json() as { appId: string };

    // 일일 한도 체크
    const [limitConfig, usage] = await Promise.all([getConfig(), getDailyUsage()]);
    const dailyLimit = Number(limitConfig["daily_limit"] ?? 30);
    if (usage.count >= dailyLimit) {
      return NextResponse.json(
        { error: `오늘의 분석 가능 횟수(${dailyLimit}회)를 모두 사용했습니다. 자정(KST)에 자동으로 초기화됩니다.` },
        { status: 429 }
      );
    }

    // 1) 게임 기본 정보 확인
    const gameInfo = await getSteamGameInfo(appId);
    if (!gameInfo) {
      return NextResponse.json(
        { error: "유효한 App ID 또는 스팀 상점 주소를 입력해 주세요." },
        { status: 400 }
      );
    }

    // 2) 큐에 추가
    const uuid = uuidv4();
    await addAnalysisToQueue(appId, gameInfo.gameName, uuid);
    await incrementDailyUsage();

    // 3) GitHub Action 트리거
    const PAT = process.env.GITHUB_PAT;
    if (PAT) {
      const dispatchRes = await fetch("https://api.github.com/repos/Kimmugil/steam-review-bot/dispatches", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "trigger-analysis",
          client_payload: {
            appId,
            uuid
          }
        })
      });
      if (!dispatchRes.ok) {
        const txt = await dispatchRes.text();
        console.error("GitHub Action Dispatch Failed:", txt);
      }
    } else {
      console.warn("GITHUB_PAT is not set. GitHub Action not triggered.");
    }

    return NextResponse.json({
      ok: true,
      uuid,
      appId,
      gameName: gameInfo.gameName,
      status: "PENDING",
      message: "분석 작업이 대기열에 등록되었습니다. (1~3분 소요)"
    });
  } catch (error: any) {
    console.error("Steam Analyze API Error:", error);
    return NextResponse.json(
      { error: "분석 작업 등록 중 서버 오류가 발생했습니다.", details: error.message || String(error) },
      { status: 500 }
    );
  }
}
