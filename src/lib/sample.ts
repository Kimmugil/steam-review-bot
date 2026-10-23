import { SAMPLE, SEGMENTS, langName, type SegmentKey } from "./config";
import { getReviewPage, SteamError, type RawReview } from "./steam";
import { allocateSamples, type WindowPlan } from "./stats";
import type { SampleInfo, SampleReview } from "./types";

/** 리뷰 쓸 때 플레이타임(시간)이 어느 구간인지. 구간은 (하한, 상한]. */
export function segmentOf(hours: number | null): SegmentKey | null {
  if (hours == null) return null;
  for (const s of SEGMENTS) {
    if ((s.min == null || hours > s.min) && (s.max == null || hours <= s.max)) return s.key;
  }
  return null;
}

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
 *  - 해석에 쓸 수 없는 너무 짧은 글(20자 미만)은 먼저 거르고, 모자랄 때만 채움
 */
export async function collectSample(
  appId: number, plan: WindowPlan, windowTotals: { code: string; total: number; pos: number }[], notes: string[],
  rng: () => number = Math.random,
): Promise<{ reviews: SampleReview[]; info: SampleInfo }> {
  const alloc = allocateSamples(windowTotals, SAMPLE.target, { min: SAMPLE.minPerLanguage, max: SAMPLE.maxPerLanguage, maxLanguages: SAMPLE.maxLanguages });
  const span = plan.endTs - plan.startTs;
  const seen = new Set<string>();
  const out: Omit<SampleReview, "n">[] = [];
  const perLang: SampleInfo["languages"] = [];
  let failed = 0;

  await Promise.all(alloc.map(async ({ code, n }) => {
    const w = windowTotals.find((x) => x.code === code)!;
    // 긍정/부정 몫: 그 언어의 실제 분석 기간 비율대로 (표본이 실제보다 비판적이거나 호의적으로 치우치지 않게)
    const posQuota = Math.min(n, Math.max(0, Math.round((n * w.pos) / Math.max(1, w.total))));
    const quotas: [1 | 2, number][] = [[1, posQuota], [2, n - posQuota]];
    const picked: RawReview[] = [];
    await Promise.all(quotas.filter(([, q]) => q > 0).map(async ([reviewType, quota]) => {
      const perSlice = Math.ceil(quota / SAMPLE.slices);
      const pages = await Promise.all(Array.from({ length: SAMPLE.slices }, async (_, k) => {
        const startTs = Math.floor(plan.startTs + (span * k) / SAMPLE.slices);
        const endTs = Math.floor(plan.startTs + (span * (k + 1)) / SAMPLE.slices);
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
        const usable = shuffle(reviews.filter((r) => r.review && clean(r.review).length >= 20), rng);
        const filler = shuffle(reviews.filter((r) => r.review && clean(r.review).length < 20 && clean(r.review).length > 0), rng);
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
    perLang.push({ code, name: langName(code), n: taken, window_total: w.total });
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
      method: `분석 기간(${plan.label}) 안의 리뷰를 시간 순 5구간으로 나눠 구간마다 무작위로 뽑았습니다. 리뷰가 많은 언어 최대 ${SAMPLE.maxLanguages}개(한국어 포함)를 기간 리뷰 수 비중대로 배분했고, 각 언어 안에서는 긍정·부정을 그 언어의 실제 비율대로 나눠 뽑았습니다. 20자 미만의 짧은 글은 해석할 수 없어 먼저 제외했습니다.`,
    },
  };
}
