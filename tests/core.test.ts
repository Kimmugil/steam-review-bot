import assert from "node:assert/strict";
import { test } from "node:test";
import { ratingLabel, makeRate, wilson, significantChange, steamScoreLabel } from "../src/lib/rating";
import { pickWindow, allocateSamples, minusRate, buildGroups, findHighlights } from "../src/lib/stats";
import { segmentOf, shuffle } from "../src/lib/sample";
import { finalizeAi, buildPrompt } from "../src/lib/interpret";
import { cleanNewsText, parseAppId, parseReleaseDate } from "../src/lib/steam";
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

test("분석 기간: 출시 직후/중간/안정기", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const d = (days: number) => new Date(now.getTime() - days * 86400000);
  const a = pickWindow(d(5), now);
  assert.equal(a.days, 5); assert.equal(a.has_previous, false); assert.equal(a.prevStartTs, null);
  const b = pickWindow(d(20), now);
  assert.equal(b.days, 10); assert.equal(b.has_previous, true);
  assert.equal(b.startTs - b.prevStartTs!, 10 * 86400);
  assert.equal(pickWindow(d(14), now).days, 7);
  assert.equal(pickWindow(d(59), now).days, 29);
  const c = pickWindow(d(400), now);
  assert.equal(c.days, 30); assert.equal(c.label, "최근 30일");
  assert.equal(pickWindow(null, now).days, 30);                                     // 출시일을 모르면 안정기로 취급
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

test("플레이타임 구간은 (하한, 상한]", () => {
  assert.equal(segmentOf(0.5), "intro"); assert.equal(segmentOf(2), "intro");
  assert.equal(segmentOf(2.1), "early"); assert.equal(segmentOf(10), "early");
  assert.equal(segmentOf(10.1), "mid"); assert.equal(segmentOf(50), "mid");
  assert.equal(segmentOf(50.1), "core"); assert.equal(segmentOf(null), null);
});

test("눈에 띄는 사실: 언어 격차·최근 vs 전체·플레이타임·뚜렷한 변화만 뽑는다", () => {
  const lr = (name: string, share: number, pos: number, neg: number) => ({ code: name, name, group: "g", all: makeRate(pos, neg), share, window: null, prev: null });
  const base = { recent: makeRate(900, 100), all: makeRate(600, 400), previous: makeRate(850, 150), delta_points: 5, delta_significant: true,
    window: { days: 30, start: "", end: "", label: "최근 30일", reason: "", has_previous: true },
    segments: [{ key: "intro", label: "입문", range: "2시간 이하", all: makeRate(0, 0), window: makeRate(40, 10) }, { key: "core", label: "코어", range: "50시간 초과", all: makeRate(0, 0), window: makeRate(300, 200) }] };
  const h = findHighlights({ ...base, languages: [lr("중국어", 49, 320, 680), lr("영어", 38, 920, 80), lr("한국어", 2, 80, 20)] } as never);
  assert.equal(h.length, 4);
  assert.ok(h[0].includes("중국어") && h[0].includes("영어") && h[0].includes("격차"));
  assert.ok(h.some((x) => x.includes("전체 기간") && x.includes("높습니다")));
  assert.ok(h.some((x) => x.includes("플레이타임")));
  assert.ok(h.some((x) => x.includes("올랐습니다")));
  const quiet = findHighlights({ ...base, recent: makeRate(600, 400), delta_significant: false, segments: [], languages: [lr("영어", 90, 800, 200), lr("중국어", 10, 70, 30)] } as never);
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
  const mk = (n: number, lang: string, up: boolean, h: number): SampleReview => ({ n, rid: String(1000 + n), lang, voted_up: up, playtime_h: h, text: `리뷰 ${n}`, ts: n });
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
  raw.segment_notes = [{ segment_key: "core", summary: "코어", review_ids: ["R3", "R4", "R5"] }, { segment_key: "intro", summary: "입문 표본 부족", review_ids: ["R1"] }];
  const ai = finalizeAi(raw, samples(), "test-model");
  assert.deepEqual(ai.themes.map((t) => t.label).sort(), ["재미", "최적화"]);
  const opt = ai.themes.find((t) => t.label === "최적화")!;
  assert.equal(opt.polarity, "negative"); assert.equal(opt.stance, "against"); assert.equal(opt.pos_share, 0); assert.equal(opt.support, 3); assert.equal(Math.round(opt.support_share * 100), 25);   // 근거 3건 / 표본 12건
  assert.equal(ai.themes.find((t) => t.label === "재미")!.polarity, "positive");
  assert.equal(ai.themes.find((t) => t.label === "재미")!.stance, "recommend");
  assert.deepEqual(ai.change_notes.map((c) => c.review_ids), [[4], []]);          // 없는 번호(R404)를 인용한 문장은 버림
  assert.equal(ai.dropped.empty_themes, 3);                                        // 근거 부족 주제 2 + 근거 번호가 없는 변화 문장 1
  assert.ok(ai.dropped.unknown_ids >= 3);
  assert.equal(ai.quotes.length, 2);
  assert.equal(ai.quotes.find((q) => q.review_id === 4)!.original, "리뷰 4");      // 원문은 AI가 아니라 DB 표본에서
  assert.equal(ai.quotes.find((q) => q.review_id === 1)!.korean, "");              // 한국어 리뷰는 번역 불필요
  assert.deepEqual(ai.language_notes.map((n) => n.language_code), ["english"]);    // 표본 8건 미만 언어(한국어 3건)는 제외
  assert.deepEqual(ai.language_notes[0].review_ids, [4]);                          // 다른 언어 번호(R1)는 걸러짐
  assert.deepEqual(ai.segment_notes.map((n) => n.segment_key), ["core"]);          // 표본 5건 미만 구간 제외
});

test("프롬프트에 숫자 규칙·표본 번호가 들어가고 오류 은폐 지시는 없다", () => {
  const rate = makeRate(90, 10);
  const stats = { version: 2, fetched_at: "", official: { ...rate, steam_desc_en: null, steam_label: "매우 긍정적" }, all: rate,
    window: { days: 30, start: "a", end: "b", label: "최근 30일", reason: "", has_previous: true }, recent: rate, previous: makeRate(80, 20),
    delta_points: 10, delta_significant: false, languages: [], groups: [], segments: [], sample: { total: 10, languages: [], method: "" }, highlights: ["테스트 사실"], data_notes: [] } as Stats;
  const p = buildPrompt("테스트", stats, [], samples());
  assert.ok(p.includes("[R4]") && p.includes("우연으로도 설명될 수 있는 작은 변화"));
  assert.ok(!p.includes("해고") && !p.includes("0개"));
  assert.ok(p.includes("언어' 기준"));
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
