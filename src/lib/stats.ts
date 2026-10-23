import { GROUP_MAP, LANG_MAP, SEGMENTS, langName } from "./config";
import { makeRate, deltaPoints, significantChange, type Rate } from "./rating";
import { countRate, getOfficial, SteamError } from "./steam";
import type { GroupRow, LangRow, SegmentRow, Stats, WindowInfo } from "./types";
// (findHighlights 는 아래에 정의)

const DAY = 86400;
const iso = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export type WindowPlan = WindowInfo & { startTs: number; endTs: number; prevStartTs: number | null; prevEndTs: number | null };

/**
 * 분석 기간 정하기 (모든 게임에 같은 규칙).
 *  출시 14일 미만: 출시 후 전체(비교할 직전 기간 없음)
 *  14~59일: 출시 후 일수의 절반(최소 7일, 최대 30일), 직전 같은 길이 기간과 비교
 *  60일 이상: 최근 30일, 직전 30일과 비교
 */
export function pickWindow(release: Date | null, now: Date = new Date()): WindowPlan {
  const endTs = Math.floor(now.getTime() / 1000);
  const since = release ? Math.floor((endTs - release.getTime() / 1000) / DAY) : 365;
  if (since < 14) {
    const days = Math.max(1, since);
    const startTs = release ? Math.floor(release.getTime() / 1000) : endTs - days * DAY;
    return { days, startTs, endTs, prevStartTs: null, prevEndTs: null, start: iso(startTs), end: iso(endTs), has_previous: false,
      label: `출시 후 ${days}일`, reason: "출시한 지 얼마 안 되어 출시 직후부터 지금까지를 봅니다. 비교할 이전 기간이 없습니다." };
  }
  const days = since < 60 ? Math.min(30, Math.max(7, Math.floor(since / 2))) : 30;
  const startTs = endTs - days * DAY;
  return { days, startTs, endTs, prevStartTs: startTs - days * DAY, prevEndTs: startTs, start: iso(startTs), end: iso(endTs), has_previous: true,
    label: `최근 ${days}일`,
    reason: since < 60 ? `출시 ${since}일째라 출시 후 일수의 절반(${days}일)을 보고, 그 직전 ${days}일과 비교합니다.` : "안정기에 들어선 게임이라 최근 30일을 보고, 그 직전 30일과 비교합니다." };
}

/** 빼기: 구간 경계(정확히 2시간 등)에 걸린 리뷰가 두 구간에 겹쳐 잡히는 것을 바로잡습니다. */
export function minusRate(a: Rate, b: Rate): Rate {
  return makeRate(Math.max(0, a.pos - b.pos), Math.max(0, a.neg - b.neg));
}

export function buildGroups(rows: LangRow[]): GroupRow[] {
  const total = rows.reduce((s, r) => s + r.all.total, 0);
  const by = new Map<string, { langs: string[]; pos: number; neg: number }>();
  for (const r of rows) {
    const g = by.get(r.group) ?? { langs: [], pos: 0, neg: 0 };
    g.langs.push(r.name); g.pos += r.all.pos; g.neg += r.all.neg;
    by.set(r.group, g);
  }
  return [...by.entries()]
    .map(([group, g]) => ({ group, languages: g.langs, all: makeRate(g.pos, g.neg), share: total ? (100 * (g.pos + g.neg)) / total : 0 }))
    .sort((a, b) => b.all.total - a.all.total);
}

/** 표본을 뽑을 언어와 언어별 목표 건수 (분석 기간 리뷰 수 비중대로, 한국어는 항상 포함) */
export function allocateSamples(
  windowTotals: { code: string; total: number }[], target: number,
  opt: { min: number; max: number; maxLanguages: number },
): { code: string; n: number }[] {
  const sorted = windowTotals.filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  let chosen = sorted.slice(0, opt.maxLanguages);
  const ko = sorted.find((x) => x.code === "koreana");
  if (ko && !chosen.includes(ko)) chosen = [...chosen.slice(0, opt.maxLanguages - 1), ko];
  const sum = chosen.reduce((s, x) => s + x.total, 0) || 1;
  return chosen.map((x) => ({ code: x.code, n: Math.min(opt.max, x.total, Math.max(opt.min, Math.round((target * x.total) / sum))) }));
}

/**
 * 숫자에서 눈에 띄는 사실을 코드가 찾습니다. (AI가 훑어보고 고르면 놓치거나 과장하므로 규칙으로 고정)
 *  - 언어 간 격차: 비중 5% 이상인 언어끼리 긍정률이 15%p 이상 벌어질 때
 *  - 최근 vs 전체: 5%p 이상 차이날 때
 *  - 플레이타임: 분석 기간 구간 중 30건 이상인 구간끼리 10%p 이상 벌어질 때
 *  - 직전 기간 대비: 통계적으로 뚜렷한 변화일 때만
 */
export function findHighlights(s: Pick<Stats, "languages" | "recent" | "all" | "previous" | "delta_points" | "delta_significant" | "segments" | "window">): string[] {
  const out: string[] = [];
  const big = s.languages.filter((l) => l.share >= 5 && l.all.rate != null && l.all.total >= 100);
  if (big.length >= 2) {
    const hi = big.reduce((a, b) => ((b.all.rate ?? 0) > (a.all.rate ?? 0) ? b : a));
    const lo = big.reduce((a, b) => ((b.all.rate ?? 100) < (a.all.rate ?? 100) ? b : a));
    if ((hi.all.rate ?? 0) - (lo.all.rate ?? 0) >= 15)
      out.push(`언어 간 격차가 큽니다: ${hi.name} 리뷰 긍정률 ${hi.all.rate!.toFixed(1)}%(비중 ${hi.share.toFixed(0)}%) vs ${lo.name} ${lo.all.rate!.toFixed(1)}%(비중 ${lo.share.toFixed(0)}%). 전체 평가는 비중이 큰 언어의 평가에 크게 좌우됩니다.`);
  }
  if (s.recent.reliable && s.all.reliable && s.recent.rate != null && s.all.rate != null && Math.abs(s.recent.rate - s.all.rate) >= 5)
    out.push(`${s.window.label} 긍정률(${s.recent.rate.toFixed(1)}%)이 전체 기간(${s.all.rate.toFixed(1)}%)보다 ${s.recent.rate > s.all.rate ? "높습니다" : "낮습니다"} (${Math.abs(s.recent.rate - s.all.rate).toFixed(1)}%p 차이).`);
  const segs = s.segments.filter((g) => g.window.total >= 30 && g.window.rate != null);
  if (segs.length >= 2) {
    const hi = segs.reduce((a, b) => (b.window.rate! > a.window.rate! ? b : a));
    const lo = segs.reduce((a, b) => (b.window.rate! < a.window.rate! ? b : a));
    if (hi.window.rate! - lo.window.rate! >= 10)
      out.push(`플레이타임에 따라 평가가 갈립니다(${s.window.label}): ${hi.label}(${hi.range}) ${hi.window.rate!.toFixed(1)}% vs ${lo.label}(${lo.range}) ${lo.window.rate!.toFixed(1)}%.`);
  }
  if (s.delta_points != null && s.delta_significant)
    out.push(`직전 같은 길이 기간보다 긍정률이 ${s.delta_points >= 0 ? "올랐습니다" : "내렸습니다"} (${s.delta_points >= 0 ? "+" : ""}${s.delta_points.toFixed(1)}%p, 우연으로 설명하기 어려운 변화).`);
  return out;
}

async function tryRate<T>(notes: string[], what: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) {
    notes.push(`${what}: ${e instanceof SteamError ? e.message : "수집 실패"}`);
    return null;
  }
}

/** 스팀에서 숫자를 모아 Stats 를 만듭니다. (표본 정보는 나중에 채움) */
export async function collectStats(appId: number, release: Date | null, onStep?: (s: string) => Promise<void> | void): Promise<{ stats: Stats; plan: WindowPlan }> {
  const notes: string[] = [];
  const plan = pickWindow(release);
  const win = { startTs: plan.startTs, endTs: plan.endTs };
  const prev = plan.prevStartTs != null ? { startTs: plan.prevStartTs, endTs: plan.prevEndTs! } : null;

  await onStep?.("stats");
  // 1) 전체 기준 — 실패하면 분석 자체가 의미 없으므로 오류로 중단
  const [official, all, recent, previous] = await Promise.all([
    getOfficial(appId),
    countRate({ appId, purchaseType: 1 }, "전체 평가"),
    countRate({ appId, purchaseType: 1, ...win }, "분석 기간 평가"),
    prev ? countRate({ appId, purchaseType: 1, ...prev }, "직전 기간 평가") : Promise.resolve(null),
  ]);

  // 2) 언어별 전체 기간 — 일부 실패는 누락으로 표시
  const codes = Object.keys(LANG_MAP);
  const langAll = await Promise.all(codes.map((code) => tryRate(notes, `${langName(code)} 전체 수치`, () => countRate({ appId, purchaseType: 1, languages: [code] }, `언어 ${code}`))));
  const failedLang = codes.filter((_, i) => langAll[i] === null).length;
  if (failedLang > 6) throw new SteamError(`언어별 수치를 ${failedLang}개 언어에서 받지 못했습니다. 스팀이 요청을 제한하고 있을 수 있어 잠시 후 다시 시도해 주세요.`);
  const sumAll = langAll.reduce((s, r) => s + (r?.total ?? 0), 0) || 1;

  // 3) 분석 기간·직전 기간 언어별 (비중 1% 이상, 최대 12개 + 한국어)
  const top = codes.map((c, i) => ({ c, t: langAll[i]?.total ?? 0 })).filter((x) => x.t / sumAll >= 0.01)
    .sort((a, b) => b.t - a.t).slice(0, 12).map((x) => x.c);
  if (!top.includes("koreana") && (langAll[codes.indexOf("koreana")]?.total ?? 0) > 0) top.push("koreana");
  const winLang = new Map<string, { w: Rate | null; p: Rate | null }>();
  await Promise.all(top.map(async (code) => {
    const [w, p] = await Promise.all([
      tryRate(notes, `${langName(code)} 분석 기간`, () => countRate({ appId, purchaseType: 1, languages: [code], ...win }, `기간 ${code}`)),
      prev ? tryRate(notes, `${langName(code)} 직전 기간`, () => countRate({ appId, purchaseType: 1, languages: [code], ...prev }, `직전 ${code}`)) : Promise.resolve(null),
    ]);
    winLang.set(code, { w, p });
  }));

  const languages: LangRow[] = codes.map((code, i) => {
    const a = langAll[i];
    return a && a.total > 0 ? { code, name: langName(code), group: GROUP_MAP[code] ?? "🌐 기타", all: a, share: (100 * a.total) / sumAll,
      window: winLang.get(code)?.w ?? null, prev: winLang.get(code)?.p ?? null } : null;
  }).filter((x): x is LangRow => x !== null).sort((a, b) => b.all.total - a.all.total);

  // 4) 플레이타임 구간 (구간 경계에 걸친 리뷰는 한 번만 세도록 겹침을 뺌)
  await onStep?.("segments");
  async function segmentRates(range?: { startTs: number; endTs: number }): Promise<Rate[]> {
    const q = (extra: { minHours?: number; maxHours?: number }, tag: string) => countRate({ appId, purchaseType: 1, ...(range ?? {}), ...extra }, `플레이타임 ${tag}`);
    const [s1, s2, s3, s4, e2, e10, e50] = await Promise.all([
      q({ maxHours: 2 }, "≤2h"), q({ minHours: 2, maxHours: 10 }, "2~10h"), q({ minHours: 10, maxHours: 50 }, "10~50h"), q({ minHours: 50 }, ">50h"),
      q({ minHours: 2, maxHours: 2 }, "=2h"), q({ minHours: 10, maxHours: 10 }, "=10h"), q({ minHours: 50, maxHours: 50 }, "=50h"),
    ]);
    return [s1, minusRate(s2, e2), minusRate(s3, e10), minusRate(s4, e50)];
  }
  const segAll = await tryRate(notes, "플레이타임 구간(전체 기간)", () => segmentRates());
  const segWin = await tryRate(notes, "플레이타임 구간(분석 기간)", () => segmentRates(win));
  const segments: SegmentRow[] = SEGMENTS.map((s, i) => ({ key: s.key, label: s.label, range: s.range,
    all: segAll?.[i] ?? makeRate(0, 0), window: segWin?.[i] ?? makeRate(0, 0) }));

  // 5) 안내문 — 숨기지 않고 화면에 그대로 보여 줌
  if (official.rate != null && all.rate != null && Math.abs(official.rate - all.rate) >= 2)
    notes.push(`스팀 상점 평가 기준(스팀 구매만) 긍정률은 ${official.rate.toFixed(1)}%, 스팀 밖 구매(키 등)까지 합치면 ${all.rate.toFixed(1)}%로 다릅니다.`);
  if (!plan.has_previous) notes.push("출시 직후라 비교할 직전 기간이 없습니다.");
  if (recent.total < 30) notes.push(`분석 기간 리뷰가 ${recent.total}건뿐이라 이 기간의 비율은 참고용입니다.`);

  const stats: Stats = {
    version: 2, fetched_at: new Date().toISOString(),
    official: { ...official, steam_desc_en: official.steam_desc_en },
    all, window: { days: plan.days, start: plan.start, end: plan.end, label: plan.label, reason: plan.reason, has_previous: plan.has_previous },
    recent, previous, delta_points: deltaPoints(recent, previous), delta_significant: significantChange(recent, previous),
    languages, groups: buildGroups(languages), segments,
    sample: { total: 0, languages: [], method: "" }, highlights: [], data_notes: notes,
  };
  stats.highlights = findHighlights(stats);
  return { stats, plan };
}
