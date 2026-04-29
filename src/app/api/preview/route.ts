import { NextRequest, NextResponse } from "next/server";
import { getSteamGameInfo } from "@/lib/steam";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get("appId");
  if (!appId) {
    return NextResponse.json({ error: "appId가 필요합니다." }, { status: 400 });
  }

  const info = await getSteamGameInfo(appId);
  if (!info) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    appId: info.appId,
    gameName: info.gameName,
    headerImage: info.headerImage,
    releaseDate: info.releaseDate.toISOString(),
  });
}
