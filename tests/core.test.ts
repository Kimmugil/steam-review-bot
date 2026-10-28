import assert from "node:assert/strict";
import { test } from "node:test";
import { ratingLabel, makeRate, wilson, significantChange, steamScoreLabel, notableChange } from "../src/lib/rating";
import { allocateSamples, minusRate, buildGroups, findHighlights, typicalVolume } from "../src/lib/stats";
import { inferHistoryDays, planWindow, noiseFromWindows, niceBound, quantileHours, segmentBounds, segmentDefs, segmentOfHours } from "../src/lib/profile";
import { minChars } from "../src/lib/config";
import { shuffle } from "../src/lib/sample";
import { finalizeAi, buildPrompt, changeDirective, mayInterpretChange } from "../src/lib/interpret";
import { cleanNewsText, notAnalyzableReason, parseAppId, parseReleaseDate, type GameInfo } from "../src/lib/steam";
import { kstDay } from "../src/lib/db";
import type { AiRaw, SampleReview, Stats } from "../src/lib/types";

test("등급: 스팀 구간과 리뷰 수 조건", () => {
  assert.equal(ratingLabel(9, 9), "평가 없음");             // 10건 미만
  assert.equal(ratingLabel(10, 10), "긍정적");              // 80%↑ 이지만 50건 미만
  assert.equal(ratingLabel(45, 50), "매우 긍정적");
  assert.equal(ratingLabel(480, 500), "압도적으로 긍정적");  // 96%, 500건
  assert.equal(ratingLabel(95, 100), "매우 긍정적");         // 95%여도 500건 미만이면 '압도적' 아님
  assert.equal(ratingLabel(75, 100), "대체로 긍정적");
  assert.equal(ratingLabel(50, 100), "복합적");
  assert.equal(ratingLabel(30, 100), "대체로 부정적");
  assert.equal(ratingLabel(5, 40), "부정적");
  assert.equal(ratingLabel(5, 100), "매우 부정적");
  assert.equal(ratingLabel(5, 1000), "압도적으로 부정적");
});

test("스팀 등급 번호: 8=매우 긍정적, 9=압도적으로 긍정적 (옛 코드는 8·9를 '평가 없음'으로 잘못 처리)", () => {
  assert.equal(steamScoreLabel(8), "매우 긍정적");
  assert.equal(steamScoreLabel(9), "압도적으로 긍정적");
  assert.equal(steamScoreLabel(5), "복합적");
  assert.equal(steamScoreLabel(0), null);
});

test("신뢰 구간: 표본이 작을수록 넓다", () => {
  const small = wilson(8, 10)!, big = wilson(800, 1000)!;
  assert.ok(small[1] - small[0] > big[1] - big[0] * 3);
  assert.ok(big[0] < 80 && big[1] > 80);
  assert.equal(wilson(0, 0), null);
  assert.equal(makeRate(0, 0).rate, null);
  assert.equal(makeRate(3, 1).reliable, false);
});

test("변화가 우연인지: 표본이 작거나 차이가 작으면 '뚜렷한 변화 아님'", () => {
  assert.equal(significantChange(makeRate(95, 5), makeRate(90, 10)), false);        // 100건 vs 100건, 5%p
  assert.equal(significantChange(makeRate(700, 300), makeRate(800, 200)), true);    // 1000건 vs 1000건, 10%p
  assert.equal(significantChange(makeRate(5, 5), makeRate(1, 9)), false);           // 표본 10건
});

import { VOLUME_DAYS as DAYS } from "../src/lib/config";
/** 하루 평균 perDay 건씩 쌓이는 게임의 기간별 누적 리뷰량 (기록이 history 일) */
const vol = (perDay: number, history: number) => DAYS.map((d) => ({ days: d, n: Math.round(perDay * Math.min(d, history)) }));

test("리뷰 기록 나이: 전체의 99.5%가 쌓인 가장 짧은 눈금. 출시일은 거친 눈금(180일 초과)에서만 보정", () => {
  assert.equal(inferHistoryDays(vol(100, 400), 100 * 400, null), 730);
  assert.equal(inferHistoryDays(vol(100, 400), 100 * 400, 400), 400);          // 365~730 구간 안 → 출시일 400일로 보정
  assert.equal(inferHistoryDays(vol(100, 400), 100 * 400, 100), 730);          // 출시일(100일)은 리뷰 기록과 무관(정식 출시일 등) → 무시
  assert.equal(inferHistoryDays(vol(10, 6000), 10 * 6000, null), 2190);        // 가장 긴 눈금보다 오래됨
  assert.equal(inferHistoryDays(vol(5000, 0.5), 2500, 0), 1);                  // 출시 당일: 리뷰 기록 1일
  assert.equal(inferHistoryDays(vol(1000, 7), 7000, 1), 7);                    // 출시 다음 날인데 리뷰는 이미 7일에 걸쳐 있음(사전 구매자 조기 플레이) → 출시일(1일)을 믿지 않고 7일
});

test("분석 기간: 이 게임의 리뷰량으로 정한다 — 리뷰 많은 게임은 짧게, 적은 게임은 길게, 신작은 처음부터", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const busy = planWindow(1000, vol(300, 1000), now);          // 하루 300건 → 14일에 4,200건
  assert.equal(busy.days, 14); assert.equal(busy.has_previous, true);
  const mid = planWindow(1000, vol(50, 1000), now);            // 하루 50건 → 14일 700건, 30일 1,500건
  assert.equal(mid.days, 30);
  const small = planWindow(1000, vol(3, 1000), now);           // 하루 3건 → 180일 540건, 목표 못 채움 → 가장 긴 후보
  assert.equal(small.days, 180); assert.match(small.reason, /리뷰가 적은 게임/);
  const young = planWindow(40, vol(500, 40), now);             // 기록 40일: 후보 중 40/2=20 이하는 14일뿐
  assert.equal(young.days, 14); assert.equal(young.has_previous, true);
  const launch = planWindow(6, vol(2000, 6), now);             // 기록 6일 → 처음부터, 비교 없음
  assert.equal(launch.days, 6); assert.equal(launch.has_previous, false); assert.equal(launch.prevStartTs, null);
  assert.equal(launch.endTs - launch.startTs, 7 * 86400);                    // 리뷰 기록 6일 → 하루 여유를 두고 모든 리뷰가 들어가는 범위
  const dayOne = planWindow(1, vol(5000, 1), now);                              // 출시 다음 날(32시간): 24시간이 아니라 이틀 범위로 전부 포함
  assert.equal(dayOne.endTs - dayOne.startTs, 2 * 86400); assert.equal(dayOne.has_previous, false); assert.match(dayOne.label, /출시 직후/);
  const weekOld = planWindow(20, vol(500, 20), now);           // 기록 20일: 후보 없음 → 절반
  assert.equal(weekOld.days, 10);
  assert.equal(busy.startTs - busy.prevStartTs!, 14 * 86400);
  assert.equal(busy.baseline.length, 6);                       // 과거 같은 길이 기간 6개(변동 폭 계산용)
  assert.equal(planWindow(60, vol(300, 60), now).baseline.length, 3);     // 기록 60일, 14일 창 → 기록 안에 들어가는 과거 기간은 3개뿐
});

test("변동 폭: 과거 기간 3개 미만이면 모름, 표본 크기만으로 생기는 흔들림보다 작게 잡지 않는다", () => {
  assert.equal(noiseFromWindows([makeRate(90, 10), makeRate(91, 9)]).noise, null);
  assert.equal(noiseFromWindows([makeRate(90, 10), makeRate(91, 9), makeRate(5, 5)]).noise, null);        // 30건 미만은 제외 → 2개
  const calm = noiseFromWindows([makeRate(900, 100), makeRate(905, 95), makeRate(902, 98), makeRate(899, 101)]);
  assert.ok(calm.noise! > 0.5 && calm.noise! < 2);                                                         // 표본이 커서 흔들림이 작음
  const wild = noiseFromWindows([makeRate(900, 100), makeRate(750, 250), makeRate(950, 50), makeRate(800, 200)]);
  assert.ok(wild.noise! > 7);
});

test("의미 있는 변화: 통계적으로 뚜렷하고 그 게임의 평소 흔들림의 2배 이상일 때만", () => {
  const a = makeRate(9300, 700), b = makeRate(9490, 510);            // 93% vs 94.9%, 표본 큼 → 통계적으로는 뚜렷
  assert.equal(significantChange(b, a), true);
  assert.equal(notableChange(b, a, 3.0), false);                      // 평소 ±3%p 흔들리는 게임이면 1.9%p는 아무 일도 아님
  assert.equal(notableChange(b, a, 0.5), true);                       // 평소 ±0.5%p 인 게임이면 큰 변화
  assert.equal(notableChange(b, a, null), false);                     // 평소 흔들림을 모르면 3%p 이상만 인정
  assert.equal(notableChange(makeRate(8000, 2000), makeRate(8500, 1500), null), true);   // 5%p
});

test("플레이타임 구간: 그 게임 리뷰어 분포의 사분위로 정한다 (신작과 오래된 게임의 경계가 다르다)", () => {
  const LADDER = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 2000];
  const cdfOf = (median: number, total: number) => LADDER.map((h) => ({ h, n: Math.round(total * (1 - Math.exp(-Math.LN2 * h / median))) }));   // 중앙값이 median 시간인 분포
  const fresh = segmentBounds(cdfOf(6, 20000), 20000).bounds;     // 막 나온 게임: 리뷰어 중앙값 6시간
  const old = segmentBounds(cdfOf(55, 900000), 900000).bounds;    // 오래된 게임: 중앙값 55시간
  assert.ok(fresh[2] < old[0] + 30, "신작의 '오래 한 쪽' 경계가 오래된 게임의 '짧은 쪽' 경계 근처");
  assert.ok(fresh[1] < 10 && old[1] > 40);
  assert.ok(fresh[0] < fresh[1] && fresh[1] < fresh[2] && old[0] < old[1] && old[1] < old[2]);
  assert.equal(Math.round(quantileHours([{ h: 10, n: 50 }, { h: 20, n: 100 }], 100, 0.25)), 5);   // 눈금 사이 직선 보간
  assert.equal(niceBound(0.4), 1); assert.equal(niceBound(7.6), 8); assert.equal(niceBound(23.4), 23); assert.equal(niceBound(73.8), 75); assert.equal(niceBound(118.9), 120); assert.equal(niceBound(432), 450);
  const defs = segmentDefs([10, 40, 100]);
  assert.deepEqual(defs.map((d) => d.range), ["10시간 이하", "10~40시간", "40~100시간", "100시간 초과"]);
  assert.equal(segmentOfHours(0.5, defs), "q1"); assert.equal(segmentOfHours(10, defs), "q1"); assert.equal(segmentOfHours(10.1, defs), "q2");
  assert.equal(segmentOfHours(40, defs), "q2"); assert.equal(segmentOfHours(100, defs), "q3"); assert.equal(segmentOfHours(100.1, defs), "q4"); assert.equal(segmentOfHours(null, defs), null);
  const same = segmentBounds([{ h: 1, n: 100 }, { h: 2, n: 100 }], 100).bounds;       // 거의 모두 1시간 이하여도 경계는 계속 커져야 함
  assert.ok(same[0] < same[1] && same[1] < same[2]);
});

test("평소 리뷰량(과거 기간 중앙값)과 분석 불가 항목 판정", () => {
  assert.equal(typicalVolume([makeRate(80, 20), makeRate(90, 10)]), null);                               // 과거 기간 3개 미만
  assert.equal(typicalVolume([makeRate(80, 20), makeRate(900, 100), makeRate(40, 10)]), 100);           // 중앙값
  const gi = (o: Partial<GameInfo>): GameInfo => ({ appId: 1, name: "x", headerImage: null, releaseDate: null, comingSoon: false, type: "game", genres: [], isFree: false, earlyAccess: false, ...o });
  assert.equal(notAnalyzableReason(gi({})), null);
  assert.equal(notAnalyzableReason(gi({ type: "demo" })), null);
  assert.match(notAnalyzableReason(gi({ type: "music" }))!, /게임 본편이 아닌/);
  assert.match(notAnalyzableReason(gi({ type: "dlc" }))!, /게임 본편이 아닌/);
  assert.match(notAnalyzableReason(gi({ comingSoon: true }))!, /출시 전/);
});

test("글자 수 기준은 언어에 맞게: 한·중·일·태는 더 짧은 글도 해석 가능", () => {
  assert.equal(minChars("english"), 20); assert.equal(minChars("koreana"), 8); assert.equal(minChars("schinese"), 8); assert.equal(minChars("russian"), 20);
});

test("표본 배분: 한국어는 항상 포함, 최소·최대 지킴", () => {
  const opt = { min: 8, max: 40, maxLanguages: 3 };
  const r = allocateSamples([{ code: "english", total: 1000 }, { code: "schinese", total: 800 }, { code: "russian", total: 200 }, { code: "koreana", total: 20 }], 100, opt);
  assert.ok(r.some((x) => x.code === "koreana"));
  assert.equal(r.length, 3);
  for (const x of r) { assert.ok(x.n >= 8 || x.n === 20); assert.ok(x.n <= 40); }
  const tiny = allocateSamples([{ code: "english", total: 5 }], 100, opt);
  assert.equal(tiny[0].n, 5);                                                       // 실제 리뷰보다 많이 뽑지 않음
});

test("눈에 띄는 사실: 우연이 아니고 이 게임의 평소 변동보다 클 때만 뽑는다", () => {
  const lr = (name: string, share: number, pos: number, neg: number) => ({ code: name, name, group: "g", all: makeRate(pos, neg), share, window: null, prev: null });
  const seg = (key: string, label: string, range: string, w: [number, number], sh: number) => ({ key, label, range, min: null, max: null, all: makeRate(0, 0), window: makeRate(w[0], w[1]), share_all: 25, share_window: sh });
  const profile = (noise: number | null, ratio: number | null = null, typical: number | null = null, prevTypical: number | null = null) => ({ noise_points: noise, volume_ratio: ratio, volume_vs_typical: typical, previous_vs_typical: prevTypical, baseline_windows: 5 }) as never;
  const base = { recent: makeRate(900, 100), all: makeRate(800, 200), previous: makeRate(850, 150), delta_points: 5, delta_notable: true,
    window: { days: 30, start: "", end: "", label: "최근 30일", reason: "", has_previous: true, reviews: 1000 },
    segments: [seg("q1", "플레이 짧은 편", "5시간 이하", [40, 10], 25), seg("q4", "플레이 긴 편", "100시간 초과", [300, 200], 25)] };
  const langs = [lr("중국어", 49, 320, 680), lr("영어", 38, 920, 80), lr("한국어", 2, 80, 20)];
  const h = findHighlights({ ...base, languages: langs, profile: profile(1.0) } as never);
  assert.ok(h[0].includes("중국어") && h[0].includes("영어") && h[0].includes("격차"));
  assert.ok(h.some((x) => x.includes("전체 기간") && x.includes("높습니다")));
  assert.ok(h.some((x) => x.includes("플레이타임")));
  assert.ok(h.some((x) => x.includes("올랐습니다")));
  // 평소 변동이 큰 게임(±12%p)이면 같은 숫자(최근 vs 전체 10%p, 플레이타임 20%p)라도 평소 흔들림의 2배(24%p)에 못 미쳐 뽑히지 않는다
  const noisy = findHighlights({ ...base, languages: langs, profile: profile(12) } as never);
  assert.ok(!noisy.some((x) => x.includes("전체 기간")));
  assert.ok(!noisy.some((x) => x.includes("플레이타임에 따라")));
  assert.ok(noisy.some((x) => x.includes("언어 간 격차")));                      // 언어 격차(60%p)는 여전히 큼
  // 리뷰량이 몰렸을 때
  const spike = findHighlights({ ...base, languages: [], segments: [], delta_notable: false, profile: profile(null, 3.2), previous: makeRate(400, 100) } as never);
  assert.ok(spike.some((x) => x.includes("3.2배")));
  // 평소 대비: 이번 기간이 평소의 3배면 알리고, 직전 기간이 평소의 2.7배(몰린 때)였다면 비교가 왜곡될 수 있다고 알린다
  const typ = findHighlights({ ...base, languages: [], segments: [], delta_notable: false, profile: profile(null, 0.3, 3.1, 2.7), previous: makeRate(400, 100) } as never);
  assert.ok(typ.some((x) => x.includes("평소") && x.includes("3.1배")));
  assert.ok(typ.some((x) => x.includes("직전 기간") && x.includes("2.7배") && x.includes("몰린")));
  const calmVol = findHighlights({ ...base, all: makeRate(900, 100), languages: [], segments: [], delta_notable: false, profile: profile(null, 0.3, 0.9, 1.0), previous: makeRate(400, 100) } as never);
  assert.equal(calmVol.length, 0);                                  // 평소 대비가 있으면 그것을 우선: 평소 범위면 직전 대비 0.3배여도 따로 알리지 않음
  // 구성 변화: 플레이 짧은 편 비중이 평소(25%)보다 크게 늘었을 때
  const mix = findHighlights({ ...base, languages: [], delta_notable: false, profile: profile(null), segments: [{ ...base.segments[0], share_window: 42 }, base.segments[1], base.segments[1], base.segments[1]] } as never);
  assert.ok(mix.some((x) => x.includes("구성이 평소와 다릅니다") && x.includes("42%")));
  const quiet = findHighlights({ ...base, recent: makeRate(600, 400), all: makeRate(600, 400), delta_notable: false, segments: [], languages: [lr("영어", 90, 800, 200), lr("중국어", 10, 70, 30)], profile: profile(2) } as never);
  assert.equal(quiet.length, 0);                                    // 격차·변화가 없으면 아무것도 만들지 않음
});

test("구간 겹침 빼기와 언어권 묶기", () => {
  const r = minusRate(makeRate(100, 20), makeRate(10, 5));
  assert.equal(r.pos, 90); assert.equal(r.neg, 15);
  assert.equal(minusRate(makeRate(1, 1), makeRate(5, 5)).total, 0);
  const lr = (code: string, name: string, group: string, pos: number, neg: number) => ({ code, name, group, all: makeRate(pos, neg), share: 0, window: null, prev: null });
  const g = buildGroups([lr("koreana", "한국어", "A", 90, 10), lr("japanese", "일본어", "A", 80, 20), lr("english", "영어", "B", 50, 50)]);
  assert.equal(g[0].group, "A"); assert.equal(g[0].all.total, 200); assert.equal(Math.round(g[0].share), 67);
});

function samples(): SampleReview[] {
  const mk = (n: number, lang: string, up: boolean, h: number): SampleReview => ({ n, rid: String(1000 + n), lang, voted_up: up, playtime_h: h, text: `리뷰 ${n}: ${"가".repeat(45)}`, ts: n });
  return [mk(1, "koreana", true, 1), mk(2, "koreana", true, 5), mk(3, "koreana", false, 60), mk(4, "english", false, 80), mk(5, "english", false, 90),
    mk(6, "english", true, 3), mk(7, "english", false, 100), mk(8, "english", false, 120), mk(9, "english", true, 20), mk(10, "english", false, 70),
    mk(11, "english", true, 15), mk(12, "english", true, 30)];   // 영어 9건(8건 이상), 한국어 3건
}
const baseRaw = (): AiRaw => ({ one_liner: "한 줄", headline: "요약", themes: [], language_notes: [], segment_notes: [], change_notes: [], news_notes: [], quotes: [], caveats: [] });

test("AI 검증: 없는 번호는 걸러내고, 주제 성격은 AI 것을 쓰되 추천 비율·비중은 코드가 계산한다", () => {
  const raw = baseRaw();
  raw.themes = [
    { label: "최적화", polarity: "negative", summary: "아쉬운 점", review_ids: ["R4", "R5", "R7"] },   // 근거가 전부 👎 → 추천 비율 0%, stance=against
    { label: "스토리", polarity: "negative", summary: "근거 1건뿐", review_ids: ["R1"] },                      // 근거 2건 미만 → 버림
    { label: "가짜", polarity: "negative", summary: "없는 번호", review_ids: ["R999", "R998"] },               // 전부 없는 번호 → 버림
    { label: "재미", polarity: "positive", summary: "OK", review_ids: ["R1", "R2", "R6"] },
  ];
  raw.change_notes = ["R4 에서 확인되는 변화", "R404 를 근거로 든 문장", "번호 없이 숫자만 말하는 문장"];
  raw.quotes = [{ review_id: "R4", korean: "번역 4" }, { review_id: "R404", korean: "없는 번호" }, { review_id: "R1", korean: "한국어 리뷰" }];
  raw.language_notes = [{ language_code: "koreana", summary: "한국어 3건뿐", review_ids: ["R1"] }, { language_code: "english", summary: "영어", review_ids: ["R4", "R1"] }];
  raw.segment_notes = [{ segment_key: "q3", summary: "중간 위", review_ids: ["R3", "R4", "R1"] }, { segment_key: "q4", summary: "표본 부족", review_ids: ["R8"] }];
  const ai = finalizeAi(raw, samples(), "test-model", segmentDefs([10, 40, 100]));
  assert.deepEqual(ai.themes.map((t) => t.label).sort(), ["재미", "최적화"]);
  const opt = ai.themes.find((t) => t.label === "최적화")!;
  assert.equal(opt.polarity, "negative"); assert.equal(opt.stance, "against"); assert.equal(opt.pos_share, 0); assert.equal(opt.support, 3); assert.equal(Math.round(opt.support_share * 100), 25);   // 근거 3건 / 표본 12건
  assert.equal(ai.themes.find((t) => t.label === "재미")!.polarity, "positive");
  assert.equal(ai.themes.find((t) => t.label === "재미")!.stance, "recommend");
  assert.deepEqual(ai.change_notes.map((c) => c.review_ids), [[4], []]);          // 없는 번호(R404)를 인용한 문장은 버림
  assert.equal(ai.dropped.empty_themes, 3);                                        // 근거 부족 주제 2 + 근거 번호가 없는 변화 문장 1
  assert.ok(ai.dropped.unknown_ids >= 3);
  assert.equal(ai.quotes.length, 2);
  assert.ok(ai.quotes.find((q) => q.review_id === 4)!.original.startsWith("리뷰 4:"));      // 원문은 AI가 아니라 DB 표본에서
  assert.equal(ai.quotes.find((q) => q.review_id === 1)!.korean, "");              // 한국어 리뷰는 번역 불필요
  assert.deepEqual(ai.language_notes.map((n) => n.language_code), ["english"]);    // 표본 8건 미만 언어(한국어 3건)는 제외
  assert.deepEqual(ai.language_notes[0].review_ids, [4]);                          // 다른 언어 번호(R1)는 걸러짐
  assert.deepEqual(ai.segment_notes.map((n) => n.segment_key), ["q3"]);            // 표본 5건 미만 구간(q4) 제외
  assert.deepEqual(ai.segment_notes[0].review_ids, [3, 4]);                        // 다른 구간 번호(R1)는 걸러짐
});

test("변화 해석 허용 규칙: 뚜렷한 변화이고 비교 대상이 평소와 비슷할 때만, 아니면 코드가 변화 해석을 막는다", () => {
  const mk = (notable: boolean, prevTypical: number | null) => ({ delta_points: 10.6, delta_notable: notable, profile: { previous_vs_typical: prevTypical } }) as unknown as Stats;
  assert.equal(mayInterpretChange(mk(true, 1.0)), true);
  assert.equal(mayInterpretChange(mk(true, 4.5)), false);        // 직전 기간이 평소의 4.5배(몰린 때) → 단정 금지
  assert.equal(mayInterpretChange(mk(false, 1.0)), false);       // 평소 흔들림 범위
  assert.equal(mayInterpretChange(mk(true, null)), true);        // 평소를 모르면 통계적으로 뚜렷한 변화만 보고 판단
  assert.match(changeDirective(mk(false, 4.5)), /해석하지 마라/);
  assert.match(changeDirective(mk(true, 4.5)), /이례적/);
  const raw = baseRaw(); raw.change_notes = ["R4 에서 확인되는 변화"];
  assert.equal(finalizeAi(raw, samples(), "m", segmentDefs([10, 40, 100]), { allowChangeNotes: false }).change_notes.length, 0);   // AI가 규칙을 어겨도 화면에 나가지 않음
  assert.equal(finalizeAi(raw, samples(), "m", segmentDefs([10, 40, 100])).change_notes.length, 1);
});

test("프롬프트에 게임 상황·숫자 규칙·표본 번호가 들어가고 오류 은폐 지시는 없다", () => {
  const rate = makeRate(90, 10);
  const defs = segmentDefs([10, 40, 100]).map((d) => ({ ...d, all: rate, window: rate, share_all: 25, share_window: 25 }));
  const stats = { version: 2, fetched_at: "", official: { ...rate, steam_desc_en: null, steam_label: "매우 긍정적" }, all: rate,
    window: { days: 30, start: "a", end: "b", label: "최근 30일", reason: "목표 건수를 채우는 가장 짧은 기간", has_previous: true, reviews: 100 }, recent: rate, previous: makeRate(80, 20),
    profile: { history_days: 900, release_days: 100, genres: ["액션", "RPG"], is_free: false, early_access: false, volume: { d7: 30, d30: 100, d90: 300 }, size_class: "small", volume_ratio: 1, noise_points: 2.5, baseline_windows: 5, playtime: { bounds: [10, 40, 100], raw: [9, 38, 99], reviewers: 5000 } },
    delta_points: 10, delta_notable: false, languages: [], groups: [], segments: defs, sample: { total: 10, languages: [], method: "" }, highlights: ["테스트 사실"], data_notes: [] } as unknown as Stats;
  const p = buildPrompt("테스트", stats, [], samples());
  assert.ok(p.includes("[R4]") && p.includes("작은 변화"));
  assert.ok(p.includes("이 게임의 상황") && p.includes("액션, RPG") && p.includes("±2.5%p") && p.includes("10·40·100시간 경계"));
  assert.ok(p.includes("스토어 표시 출시일은 100일 전이지만"));                 // 리뷰 나이와 출시일이 다르면 알려 줌
  assert.ok(!p.includes("해고") && !p.includes("0개"));
  assert.ok(p.includes("언어' 기준"));
  assert.ok(p.includes("q1(플레이 짧은 편, 10시간 이하)"));
});

test("플레이타임이 기록되지 않는 게임: 구간 없이 프롬프트가 만들어지고 AI에게 플레이타임을 쓰지 말라고 한다", () => {
  const rate = makeRate(90, 10);
  const stats = { version: 2, fetched_at: "", official: { ...rate, steam_desc_en: null, steam_label: "매우 긍정적" }, all: rate,
    window: { days: 2, start: "a", end: "b", label: "출시 직후 2일 전체", reason: "처음부터 지금까지", has_previous: false, reviews: 100 }, recent: rate, previous: null,
    profile: { history_days: 2, release_days: 1, genres: ["액션"], is_free: false, early_access: false, volume: { d7: 100, d30: 100, d90: 100 }, size_class: "small", volume_ratio: null, volume_vs_typical: null, previous_vs_typical: null, noise_points: null, baseline_windows: 0, playtime: null, playtime_coverage: 0.001 },
    delta_points: null, delta_notable: false, languages: [], groups: [], segments: [], sample: { total: 10, languages: [], method: "" }, highlights: [], data_notes: [] } as unknown as Stats;
  const p = buildPrompt("신작", stats, [], samples());
  assert.ok(p.includes("플레이타임 정보가 없다") && p.includes("플레이타임 분석을 하지 않습니다"));
  assert.ok(!p.includes("사분위입니다("));
  assert.deepEqual(findHighlights({ ...stats, languages: [] } as never), []);          // 구간이 없어도 오류 없이 동작
});

test("뉴스 정리·App ID·출시일·한국 날짜", () => {
  assert.equal(cleanNewsText("[h1]제목[/h1] <b>본문</b> https://a.b/c &amp; 끝"), "제목 본문 & 끝");
  assert.equal(parseAppId("https://store.steampowered.com/app/2215430/Foo/"), 2215430);
  assert.equal(parseAppId(" 1623730 "), 1623730);
  assert.equal(parseAppId("hello"), null);
  assert.equal(parseReleaseDate("2025년 1월 20일")!.toISOString().slice(0, 10), "2025-01-20");
  assert.equal(parseReleaseDate("20 Jan, 2025")!.toISOString().slice(0, 10), "2025-01-20");
  assert.equal(parseReleaseDate("출시 예정"), null);
  assert.equal(kstDay(new Date("2026-10-22T15:30:00Z")), "2026-10-23");           // UTC 15:30 = KST 다음날 00:30
  assert.equal(kstDay(new Date("2026-10-22T14:59:00Z")), "2026-10-22");
  assert.equal(shuffle([1, 2, 3], () => 0).length, 3);
});

test("대표 리뷰: 추천·부정을 이 기간 실제 긍정률에 맞추고, 같은 언어는 최대 2건, 짧은 글은 뺀다", () => {
  const mk = (n: number, lang: string, up: boolean, len = 60): SampleReview => ({ n, rid: String(n), lang, voted_up: up, playtime_h: 10, text: "x".repeat(len), ts: n });
  const s: SampleReview[] = [mk(1, "english", false), mk(2, "english", false), mk(3, "english", false), mk(4, "english", true), mk(5, "english", true),
    mk(6, "german", true), mk(7, "german", true), mk(8, "french", true), mk(9, "french", true), mk(10, "russian", true), mk(11, "russian", true), mk(12, "polish", true, 10)];
  const raw = baseRaw();
  raw.quotes = s.map((r) => ({ review_id: `R${r.n}`, korean: "번역" }));   // AI가 부정 리뷰를 앞쪽에 몰아서 고른 경우
  const ai = finalizeAi(raw, s, "m", segmentDefs([10, 40, 100]), { recentRate: 80 });
  assert.equal(ai.quotes.length, 6);
  assert.equal(ai.quotes.filter((q) => !q.voted_up).length, 1);                     // 6건 중 80% = 추천 5·비추천 1
  assert.equal(ai.quote_rule!.pos, 5); assert.equal(ai.quote_rule!.neg, 1);
  const byLang = new Map<string, number>(); for (const q of ai.quotes) byLang.set(q.language, (byLang.get(q.language) ?? 0) + 1);
  assert.ok([...byLang.values()].every((n) => n <= 2));
  assert.ok(!ai.quotes.some((q) => q.review_id === 12));                             // 너무 짧은 글(10자)은 제외
});
