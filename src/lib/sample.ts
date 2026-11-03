import { CJK_LANGS, SAMPLE, isAbusive, langName, minChars } from "./config";
import { getReviewPage, SteamError, type RawReview } from "./steam";
import { allocateSamples } from "./stats";
import type { WindowPlan } from "./profile";
import type { QuoteCand, SampleInfo, SampleReview } from "./types";

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clean = (s: string) => s.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();

/**
 * AI에게 줄 리뷰 표본을 뽑습니다.
 *  - 분석 기간 안의 리뷰만, 비중이 큰 언어 위주로 (언어별 목표 건수는 그 언어의 기간 리뷰 수 비중대로)
 *  - 기간을 5등분해서 구간마다 무작위로 골라, 최근 하루에 쏠리지 않게 함
 *  - '도움이 많이 눌린 순'이 아니라 시간 범위 안에서 무작위(도움순은 길고 비판적인 글에 치우침)
 *  - 해석에 쓸 수 없는 너무 짧은 글(영어 등 20자 미만, 한·중·일·태 8자 미만)은 먼저 거르고, 모자랄 때만 채움
 */
export async function collectSample(
  appId: number, plan: WindowPlan, windowTotals: { code: string; total: number; pos: number }[], notes: string[],
  rng: () => number = Math.random,
  focus: { code: string; pos: number; total: number; minWindow?: number }[] = [],
): Promise<{ reviews: SampleReview[]; info: SampleInfo }> {
  // 기본 배분 + 주목 언어(다른 언어와 긍정률이 크게 다른 언어)는 이유를 읽을 수 있게 더 뽑는다.
  // 분석 기간에 그 언어 리뷰가 적으면(비중이 작은 언어는 기간 통계가 아예 없을 수 있음) 전체 기간에서 뽑는다.
  type Plan = { code: string; n: number; scope: "window" | "all"; pos: number; total: number };
  const alloc: Plan[] = allocateSamples(windowTotals, SAMPLE.target, { min: SAMPLE.minPerLanguage, max: SAMPLE.maxPerLanguage, maxLanguages: SAMPLE.maxLanguages })
    .map((a) => { const w = windowTotals.find((x) => x.code === a.code)!; return { code: a.code, n: a.n, scope: "window" as const, pos: w.pos, total: w.total }; });
  for (const f of focus) {
    const i = alloc.findIndex((x) => x.code === f.code);
    const w = windowTotals.find((x) => x.code === f.code);
    const entry: Plan = w && w.total >= (f.minWindow ?? SAMPLE.focusMin * 2)
      ? { code: f.code, n: Math.min(SAMPLE.focusMin, w.total), scope: "window", pos: w.pos, total: w.total }
      : { code: f.code, n: Math.min(SAMPLE.focusMin, f.total), scope: "all", pos: f.pos, total: f.total };
    if (i < 0) alloc.push(entry);
    else if (entry.scope === "all" || entry.n > alloc[i].n) alloc[i] = entry;
  }
  const seen = new Set<string>();
  const out: Omit<SampleReview, "n">[] = [];
  const perLang: SampleInfo["languages"] = [];
  let failed = 0;

  await Promise.all(alloc.map(async ({ code, n, scope, pos, total }) => {
    const w = { pos, total };
    const slices = scope === "window" ? SAMPLE.slices : 1;
    const lo = scope === "window" ? plan.startTs : 0;
    const rangeSpan = plan.endTs - lo;
    // 긍정/부정 몫: 그 언어의 실제 분석 기간 비율대로 (표본이 실제보다 비판적이거나 호의적으로 치우치지 않게)
    const posQuota = Math.min(n, Math.max(0, Math.round((n * w.pos) / Math.max(1, w.total))));
    const quotas: [1 | 2, number][] = [[1, posQuota], [2, n - posQuota]];
    const picked: RawReview[] = [];
    await Promise.all(quotas.filter(([, q]) => q > 0).map(async ([reviewType, quota]) => {
      const perSlice = Math.ceil(quota / slices);
      const pages = await Promise.all(Array.from({ length: slices }, async (_, k) => {
        const startTs = Math.floor(lo + (rangeSpan * k) / slices);
        const endTs = Math.floor(lo + (rangeSpan * (k + 1)) / slices);
        try {
          return (await getReviewPage({ appId, languages: [code], purchaseType: 1, reviewType, startTs, endTs, perPage: 100 }, `표본 ${code}/${reviewType === 1 ? "긍정" : "부정"}#${k + 1}`)).reviews;
        } catch (e) {
          failed++;
          if (!(e instanceof SteamError)) throw e;
          return [] as RawReview[];
        }
      }));
      const got: RawReview[] = [];
      for (const reviews of pages) {
        const min = minChars(code);   // 글자당 담기는 뜻이 많은 언어(한·중·일·태)는 더 짧은 글도 해석 가능
        const usable = shuffle(reviews.filter((r) => r.review && clean(r.review).length >= min), rng);
        const filler = shuffle(reviews.filter((r) => r.review && clean(r.review).length < min && clean(r.review).length > 0), rng);
        got.push(...[...usable, ...filler].slice(0, perSlice));
      }
      picked.push(...shuffle(got, rng).slice(0, quota));
    }));
    let taken = 0;
    for (const r of picked) {
      if (seen.has(r.recommendationid)) continue;
      seen.add(r.recommendationid);
      const pt = r.author?.playtime_at_review;
      out.push({
        rid: r.recommendationid, lang: code, voted_up: Boolean(r.voted_up),
        playtime_h: pt != null ? Math.round((pt / 60) * 10) / 10 : null,
        text: clean(r.review).slice(0, SAMPLE.storeChars), ts: r.timestamp_created,
      });
      taken++;
    }
    perLang.push({ code, name: langName(code), n: taken, window_total: windowTotals.find((x) => x.code === code)?.total ?? 0, scope });
  }));

  if (failed > 0) notes.push(`리뷰 표본을 모으는 요청 ${failed}건이 실패해 일부 언어·기간의 표본이 적을 수 있습니다.`);
  const order = new Map(alloc.map((a, i) => [a.code, i]));
  out.sort((a, b) => (order.get(a.lang)! - order.get(b.lang)!) || a.ts - b.ts);
  const reviews: SampleReview[] = out.map((r, i) => ({ ...r, n: i + 1 }));
  perLang.sort((a, b) => (order.get(a.code)! - order.get(b.code)!));
  return {
    reviews,
    info: {
      total: reviews.length, languages: perLang,
      method: `분석 기간(${plan.label}) 안의 리뷰를 시간 순 5구간으로 나눠 구간마다 무작위로 뽑았습니다. 리뷰가 많은 언어 최대 ${SAMPLE.maxLanguages}개(한국어 포함)를 기간 리뷰 수 비중대로 배분했고, 각 언어 안에서는 긍정·부정을 그 언어의 실제 비율대로 나눠 뽑았습니다. 너무 짧은 글(영어 등 20자, 한·중·일·태 8자 미만)은 해석할 수 없어 먼저 제외했습니다.${focus.length ? " 다른 언어와 긍정률이 크게 다른 언어와 한국어는 이유를 읽을 수 있도록 더 많이 뽑았고, 분석 기간에 그 언어 리뷰가 적으면 전체 기간에서 뽑았습니다." : ""}`,
    },
  };
}

/**
 * 대표 리뷰 후보: 분석 기간에 '도움이 됨'을 많이 받은 리뷰를 추천·비추천 따로 가져옵니다 (한국어는 조금 더).
 * 주제 비중 계산에는 쓰지 않습니다(도움순은 길고 비판적인 글에 치우침). 대표 리뷰를 고르는 데만 씁니다.
 * 욕설·혐오 표현, 너무 짧은 글, 앞부분이 같은 글(복사해 붙인 단체 리뷰)은 뺍니다.
 */
export async function collectQuoteCandidates(appId: number, plan: WindowPlan, notes: string[]): Promise<QuoteCand[]> {
  const reqs: { lang?: string; type: 1 | 2; n: number }[] = [{ type: 1, n: 12 }, { type: 2, n: 12 }, { lang: "koreana", type: 1, n: 4 }, { lang: "koreana", type: 2, n: 4 }];
  const pages = await Promise.all(reqs.map(async (r) => {
    try {
      const p = await getReviewPage({ appId, languages: r.lang ? [r.lang] : undefined, filter: 0, reviewType: r.type, purchaseType: 1, startTs: plan.startTs, endTs: plan.endTs, perPage: 40 },
        `대표 리뷰 후보 ${r.lang ?? "전체"}/${r.type === 1 ? "추천" : "비추천"}`);
      return { r, list: p.reviews };
    } catch (e) {
      if (!(e instanceof SteamError)) throw e;
      return { r, list: [] as RawReview[] };
    }
  }));
  const out: QuoteCand[] = [];
  const seenId = new Set<string>(), seenHead = new Set<string>();
  for (const { r, list } of pages) {
    let taken = 0;
    for (const x of list) {
      if (taken >= r.n) break;
      const text = clean(x.review ?? "");
      const head = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 60);
      if (!text || seenId.has(x.recommendationid) || seenHead.has(head)) continue;
      if (text.length < (CJK_LANGS.has(x.language) ? 15 : 40) || isAbusive(text)) continue;
      seenId.add(x.recommendationid); seenHead.add(head);
      const pt = x.author?.playtime_at_review;
      out.push({ q: out.length + 1, rid: x.recommendationid, lang: x.language, voted_up: Boolean(x.voted_up), votes_up: Number(x.votes_up ?? 0),
        playtime_h: pt != null ? Math.round((pt / 60) * 10) / 10 : null, text: text.slice(0, 1000), ts: x.timestamp_created });
      taken++;
    }
  }
  if (!out.length) notes.push("분석 기간에 '도움이 됨'을 받은 리뷰를 가져오지 못해, 대표 리뷰는 무작위 표본에서 골랐습니다.");
  return out;
}
