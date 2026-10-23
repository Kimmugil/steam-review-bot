import { NextRequest, NextResponse } from "next/server";
import { clientKey } from "@/lib/auth";
import { dispatchAnalysis } from "@/lib/github";
import { limited } from "@/lib/ratelimit";
import { createRequest, lookupGame, markFailed, reapStuck, refundSlotFor, usageToday } from "@/lib/repo";
import { getGameInfo, parseAppId } from "@/lib/steam";

export const maxDuration = 30;

/**
 * 분석 요청.
 *  1) 같은 게임이 진행 중이면 → { status: 'active' }      (새로 만들지 않고 그 분석을 알려 줌)
 *  2) 이미 분석된 리포트가 있으면 → { status: 'exists' }   (사용자가 '볼래요' / '새로 분석할래요'를 고름. 새로 분석은 force: true 로 다시 요청)
 *  3) 오늘 한도를 다 썼으면 → 429 { status: 'limit' }
 *  4) 접수되면 → { status: 'created', id } 하고 GitHub Actions 를 깨움
 */
export async function POST(req: NextRequest) {
  if (await limited("request", 12, 60)) return NextResponse.json({ error: "요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { input?: string; appId?: number; force?: boolean };
  const appId = parseAppId(String(body.appId ?? body.input ?? ""));
  if (!appId) return NextResponse.json({ error: "게임 이름을 검색해 고르거나, 스팀 상점 주소 · App ID를 입력해 주세요." }, { status: 400 });

  await reapStuck().catch(() => 0);
  const info = await getGameInfo(appId).catch(() => null);
  if (!info) return NextResponse.json({ error: "스팀에서 이 게임을 찾지 못했습니다. App ID를 다시 확인해 주세요." }, { status: 400 });
  if (info.comingSoon) return NextResponse.json({ error: "아직 출시 전인 게임이라 분석할 리뷰가 없습니다." }, { status: 400 });

  const { active, latest } = await lookupGame(appId);
  if (active) return NextResponse.json({ status: "active", analysis: active });
  if (latest && !body.force) return NextResponse.json({ status: "exists", analysis: latest });

  const res = await createRequest({
    appId, name: info.name, headerImage: info.headerImage, via: "web",
    releaseDate: info.releaseDate ? info.releaseDate.toISOString().slice(0, 10) : null,
    requesterHash: await clientKey().catch(() => null),
  });
  if (res.kind === "limit") return NextResponse.json({ status: "limit", usage: await usageToday() }, { status: 429 });
  if (res.kind === "active") return NextResponse.json({ status: "active", analysis: res.analysis });

  const d = await dispatchAnalysis(res.id);
  if (!d.ok) {
    await markFailed(res.id, d.message);
    await refundSlotFor(new Date());
    return NextResponse.json({ error: d.message }, { status: 502 });
  }
  return NextResponse.json({ status: "created", id: res.id });
}
