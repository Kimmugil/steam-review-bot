import { GeminiError, MODEL, interpret } from "./gemini";
import { buildPrompt, finalizeAi, mayInterpretChange } from "./interpret";
import { collectSample } from "./sample";
import { collectStats } from "./stats";
import { SteamError, getGameInfo, getOfficialNews, notAnalyzableReason } from "./steam";
import { aiCallsThisMonth, getAnalysis, markFailed, markRunning, recordAi, refundSlotFor, saveDone, setStep, upsertGame } from "./repo";
import type { NewsItem, Stats } from "./types";

/** 사용자에게 그대로 보여 줘도 되는 실패 사유 */
class UserFacing extends Error {}

/**
 * 분석 한 건을 끝까지 실행합니다. (GitHub Actions 에서 호출)
 * 어떤 단계든 실패하면 '실패'와 이유를 기록하고, 웹 요청이었다면 오늘 한도 1칸을 돌려줍니다. 0으로 채워 정상처럼 저장하지 않습니다.
 */
export async function runAnalysis(id: string, log: (m: string) => void = console.log): Promise<void> {
  const row = await getAnalysis(id);
  if (!row) throw new Error(`분석 ${id} 을(를) 찾을 수 없습니다`);
  if (row.status === "done") { log("이미 완료된 분석입니다."); return; }
  await markRunning(id);
  const t0 = Date.now();
  const lap = (m: string) => log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

  try {
    // 1) 게임 정보
    const info = await getGameInfo(row.app_id);
    if (!info) throw new UserFacing("스팀에서 이 App ID의 게임을 찾을 수 없습니다.");
    const why = notAnalyzableReason(info);
    if (why) throw new UserFacing(why);
    const releaseIso = info.releaseDate ? info.releaseDate.toISOString().slice(0, 10) : null;
    await upsertGame(info.appId, info.name, info.headerImage, releaseIso);
    lap(`게임 정보: ${info.name} (출시 ${releaseIso ?? "알 수 없음"})`);

    // 2) 숫자 (스팀에서 정확한 건수를 받아 코드가 계산)
    const { stats, plan } = await collectStats(row.app_id, info, (s) => setStep(id, s));
    if (stats.all.total < 10) throw new UserFacing(`이 게임의 리뷰가 아직 ${stats.all.total}건뿐이라 분석하기엔 너무 적어요. 리뷰가 10건 이상 쌓인 뒤에 다시 요청해 주세요.`);
    lap(`숫자 수집 완료: 전체 ${stats.all.total}건, ${stats.window.label} ${stats.recent.total}건`);

    // 3) 소식 (실패해도 분석은 계속, 안내만 남김)
    await setStep(id, "news");
    let news: NewsItem[] = [];
    // 소식은 분석 기간과 그 직전 기간에 올라온 것 위주로 (변화와 맞춰 볼 수 있게). 없으면 최근 1년 안의 최신 2건.
    try {
      news = await getOfficialNews(row.app_id, 4, plan.days * 2 + 7);
      if (!news.length) news = await getOfficialNews(row.app_id, 2, 365);
    } catch (e) { stats.data_notes.push(`공식 소식을 가져오지 못했습니다: ${e instanceof SteamError ? e.message : "오류"}`); }
    if (!news.length) stats.data_notes.push("최근 1년 안에 개발사가 직접 올린 공지가 없어 소식 분석은 하지 않았습니다.");

    // 4) 리뷰 표본
    await setStep(id, "reviews");
    const windowTotals = stats.languages.filter((l) => l.window).map((l) => ({ code: l.code, total: l.window!.total, pos: l.window!.pos }));
    const { reviews, info: sampleInfo } = await collectSample(row.app_id, plan, windowTotals, stats.data_notes);
    stats.sample = sampleInfo;
    lap(`표본 ${reviews.length}건 (${sampleInfo.languages.length}개 언어)`);
    if (reviews.length) {
      const sp = (100 * reviews.filter((r) => r.voted_up).length) / reviews.length;
      if (stats.recent.rate != null && Math.abs(sp - stats.recent.rate) > 5)
        stats.data_notes.push(`표본의 긍정 비율(${sp.toFixed(0)}%)이 실제 분석 기간 긍정률(${stats.recent.rate.toFixed(0)}%)과 달라, 표본 안에서의 주제 비중은 실제 비중과 다를 수 있습니다.`);
    }

    // 5) AI 해석 (표본이 너무 적거나, 이번 달 호출 상한이면 숫자만 저장)
    let ai = null;
    const cap = await aiCallsThisMonth();
    if (reviews.length < 20) stats.data_notes.push(`표본이 ${reviews.length}건뿐이라 AI 해석은 하지 않고 숫자만 저장했습니다.`);
    else if (cap.used >= cap.cap) stats.data_notes.push(`이번 달 AI 호출 상한(${cap.cap}회)에 도달해 AI 해석은 하지 않고 숫자만 저장했습니다.`);
    else {
      await setStep(id, "ai");
      const { raw, usage } = await interpret(buildPrompt(info.name, stats, news, reviews));
      await recordAi(id, "analysis", usage.input, usage.output);
      ai = finalizeAi(raw, reviews, MODEL, stats.segments, { allowChangeNotes: mayInterpretChange(stats) });
      lap(`AI 해석 완료 (주제 ${ai.themes.length}개, 걸러낸 근거 번호 ${ai.dropped.unknown_ids}개)`);
    }

    // 6) 저장
    await setStep(id, "saving");
    await saveDone(id, {
      game: { name: info.name, headerImage: info.headerImage, releaseDate: releaseIso },
      period: { days: plan.days, start: plan.start, end: plan.end, label: plan.label, reason: plan.reason },
      summary: { allDesc: stats.official.steam_label ?? stats.official.label, allTotal: stats.official.total, recentDesc: stats.recent.label, recentTotal: stats.recent.total, oneLiner: ai?.one_liner ?? null },
      stats: stats satisfies Stats, ai, news, samples: reviews,
    });
    lap("저장 완료");
  } catch (e) {
    const msg = e instanceof UserFacing || e instanceof SteamError || e instanceof GeminiError ? e.message : `예상하지 못한 오류가 났습니다. (${e instanceof Error ? e.message : String(e)})`.slice(0, 300);
    log(`실패: ${msg}`);
    await markFailed(id, msg);
    if (row.requested_via === "web") await refundSlotFor(row.requested_at);   // 사용자 잘못이 아닌 실패는 한도를 쓰지 않게
    throw e;
  }
}
