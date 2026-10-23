import { GROUP_MAP, LANG_MAP, langName } from "./config";
import { collectBaseline, collectPlaytimeCdf, collectSegmentRates, collectVolume, inferHistoryDays, noiseFromWindows, planWindow, segmentBounds, segmentDefs, sizeClass, type WindowPlan } from "./profile";
import { deltaPoints, makeRate, notableChange, twoPropZ, type Rate } from "./rating";
import { countRate, getOfficial, SteamError, type GameInfo } from "./steam";
import type { GroupRow, LangRow, SegmentRow, Stats } from "./types";

export type { WindowPlan };

/** 빼기: 구간 경계(정확히 N시간)에 걸린 리뷰가 두 구간에 겹쳐 잡히는 것을 바로잡습니다. */
export function minusRate(a: Rate, b: Rate): Rate {
  return makeRate(Math.max(0, a.pos - b.pos), Math.max(0, a.neg - b.neg));
}

/** 과거 기간들의 리뷰 수 중앙값(평소 리뷰량). 과거 기간이 3개 미만이면 알 수 없음 */
export function typicalVolume(baseline: Rate[]): number | null {
  if (baseline.length < 3) return null;
  const v = baseline.map((b) => b.total).sort((a, b) => a - b);
  const m = v[Math.floor(v.length / 2)];
  return m > 0 ? m : null;
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
 * 숫자에서 눈에 띄는 사실을 코드가 찾습니다. 모든 기준은 '표본 크기로 우연이 아닐 것' + '그 게임이 평소 흔들리는 폭보다 클 것'.
 * (고정 숫자만 쓰면, 평소 변동이 큰 게임에서는 사소한 일을, 작은 게임에서는 중요한 일을 놓칩니다)
 */
export function findHighlights(s: Pick<Stats, "languages" | "recent" | "all" | "previous" | "delta_points" | "delta_notable" | "segments" | "window" | "profile">): string[] {
  const out: string[] = [];
  const noise = s.profile.noise_points;
  const floor = (min: number) => Math.max(min, noise != null ? 2 * noise : min);   // 최소 폭과 '평소 변동의 2배' 중 큰 값

  // 리뷰량: 평소(과거 기간 중앙값) 대비를 우선, 모르면 직전 기간 대비. 세일·업데이트·화제로 리뷰가 몰리면 그 기간 숫자는 평소와 구성이 다릅니다.
  const p = s.profile;
  const spiky = (r: number) => r >= 2 || r <= 0.5;
  if (p.volume_vs_typical != null && s.recent.total >= 100 && spiky(p.volume_vs_typical))
    out.push(`${s.window.label} 리뷰 수(${s.recent.total.toLocaleString()}건)가 이 게임의 평소(과거 ${p.baseline_windows}개 기간 중앙값)의 ${p.volume_vs_typical.toFixed(1)}배입니다. 리뷰가 ${p.volume_vs_typical >= 1 ? "몰린" : "줄어든"} 때라 이 기간 숫자는 평소와 구성이 다를 수 있어요.`);
  else if (p.volume_vs_typical == null && p.volume_ratio != null && s.recent.total >= 100 && s.previous && s.previous.total >= 100 && spiky(p.volume_ratio))
    out.push(`${s.window.label} 리뷰 수(${s.recent.total.toLocaleString()}건)가 직전 같은 길이 기간(${s.previous.total.toLocaleString()}건)의 ${p.volume_ratio.toFixed(1)}배입니다. 리뷰가 ${p.volume_ratio >= 1 ? "몰린" : "줄어든"} 때라 이 기간 숫자는 평소와 구성이 다를 수 있어요.`);
  if (p.previous_vs_typical != null && s.previous && s.previous.total >= 100 && spiky(p.previous_vs_typical))
    out.push(`비교 대상인 직전 기간(${s.previous.total.toLocaleString()}건)은 이 게임의 평소의 ${p.previous_vs_typical.toFixed(1)}배로 리뷰가 ${p.previous_vs_typical >= 1 ? "몰린" : "적었던"} 때였어요. 직전 기간과의 비교는 평소 모습과의 비교가 아닐 수 있어요.`);

  const big = s.languages.filter((l) => l.share >= 5 && l.all.rate != null && l.all.total >= 100);
  if (big.length >= 2) {
    const hi = big.reduce((a, b) => ((b.all.rate ?? 0) > (a.all.rate ?? 0) ? b : a));
    const lo = big.reduce((a, b) => ((b.all.rate ?? 100) < (a.all.rate ?? 100) ? b : a));
    if ((hi.all.rate ?? 0) - (lo.all.rate ?? 0) >= 15 && Math.abs(twoPropZ(hi.all, lo.all)) >= 1.96)
      out.push(`언어 간 격차가 큽니다: ${hi.name} 리뷰 긍정률 ${hi.all.rate!.toFixed(1)}%(비중 ${hi.share.toFixed(0)}%) vs ${lo.name} ${lo.all.rate!.toFixed(1)}%(비중 ${lo.share.toFixed(0)}%). 전체 평가는 비중이 큰 언어의 평가에 크게 좌우됩니다.`);
  }

  if (s.recent.reliable && s.all.reliable && s.recent.rate != null && s.all.rate != null) {
    const d = s.recent.rate - s.all.rate;
    if (Math.abs(d) >= floor(5) && Math.abs(twoPropZ(s.recent, s.all)) >= 1.96)
      out.push(`${s.window.label} 긍정률(${s.recent.rate.toFixed(1)}%)이 전체 기간(${s.all.rate.toFixed(1)}%)보다 ${d > 0 ? "높습니다" : "낮습니다"} (${Math.abs(d).toFixed(1)}%p 차이).`);
  }

  const segs = s.segments.filter((g) => g.window.total >= 30 && g.window.rate != null);
  if (segs.length >= 2) {
    const hi = segs.reduce((a, b) => (b.window.rate! > a.window.rate! ? b : a));
    const lo = segs.reduce((a, b) => (b.window.rate! < a.window.rate! ? b : a));
    if (hi.window.rate! - lo.window.rate! >= floor(8) && Math.abs(twoPropZ(hi.window, lo.window)) >= 1.96)
      out.push(`플레이타임에 따라 평가가 갈립니다(${s.window.label}, 이 게임 리뷰어 기준): ${hi.label}(${hi.range}) ${hi.window.rate!.toFixed(1)}% vs ${lo.label}(${lo.range}) ${lo.window.rate!.toFixed(1)}%.`);
  }

  const q1 = s.segments[0], q4 = s.segments[3];   // 플레이타임이 기록되지 않는 게임은 구간이 없어 둘 다 없음
  if (q1 && Math.abs(q1.share_window - q1.share_all) >= 8 && s.recent.total >= 100)
    out.push(`분석 기간에 리뷰를 쓴 사람의 구성이 평소와 다릅니다: 플레이 시간이 짧은 상태(${q1.range})에서 쓴 리뷰가 ${q1.share_window.toFixed(0)}%로, 전체 기간(${q1.share_all.toFixed(0)}%)보다 ${q1.share_window > q1.share_all ? "많습니다" : "적습니다"}.`);
  else if (q4 && Math.abs(q4.share_window - q4.share_all) >= 8 && s.recent.total >= 100)
    out.push(`분석 기간에 리뷰를 쓴 사람의 구성이 평소와 다릅니다: 오래 플레이한 뒤(${q4.range})에 쓴 리뷰가 ${q4.share_window.toFixed(0)}%로, 전체 기간(${q4.share_all.toFixed(0)}%)보다 ${q4.share_window > q4.share_all ? "많습니다" : "적습니다"}.`);

  if (s.delta_points != null && s.delta_notable)
    out.push(`직전 같은 길이 기간보다 긍정률이 ${s.delta_points >= 0 ? "올랐습니다" : "내렸습니다"} (${s.delta_points >= 0 ? "+" : ""}${s.delta_points.toFixed(1)}%p). 표본 크기로도, 이 게임이 평소 흔들리는 폭${noise != null ? `(±${noise.toFixed(1)}%p)` : ""}으로도 설명하기 어려운 변화입니다.`);
  return out;
}

async function tryRate<T>(notes: string[], what: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) {
    notes.push(`${what}: ${e instanceof SteamError ? e.message : "수집 실패"}`);
    return null;
  }
}

/** 스팀에서 숫자를 모아 Stats 를 만듭니다. (표본 정보는 나중에 채움) 분석 기준은 모두 이 게임 자신의 데이터에서 정합니다. */
export async function collectStats(appId: number, info: GameInfo, onStep?: (s: string) => Promise<void> | void): Promise<{ stats: Stats; plan: WindowPlan }> {
  const notes: string[] = [];

  await onStep?.("stats");
  // 1) 전체 기준 + 리뷰량 곡선 — 실패하면 분석 자체가 의미 없으므로 오류로 중단
  const [official, all, volume] = await Promise.all([
    getOfficial(appId),
    countRate({ appId, purchaseType: 1 }, "전체 평가"),
    collectVolume(appId),
  ]);
  const releaseDays = info.releaseDate ? Math.max(0, Math.floor((Date.now() - info.releaseDate.getTime()) / 86400000)) : null;   // 시차로 출시일이 '내일'로 보여도 0일로
  const history = inferHistoryDays(volume, all.total, releaseDays);

  // 2) 이 게임에 맞는 분석 기간과 과거 기간들 (직전 기간 + 변동 폭 계산용)
  const plan = planWindow(history, volume);
  const win = { startTs: plan.startTs, endTs: plan.endTs };
  const prev = plan.prevStartTs != null ? { startTs: plan.prevStartTs, endTs: plan.prevEndTs! } : null;
  const [recent, baseline] = await Promise.all([
    countRate({ appId, purchaseType: 1, ...win }, "분석 기간 평가"),
    collectBaseline(appId, plan),
  ]);
  plan.reviews = recent.total;
  const previous = baseline[0] ?? null;
  const { noise, used } = noiseFromWindows(baseline);
  const typical = typicalVolume(baseline);

  // 3) 언어별 전체 기간 — 일부 실패는 누락으로 표시
  const codes = Object.keys(LANG_MAP);
  const langAll = await Promise.all(codes.map((code) => tryRate(notes, `${langName(code)} 전체 수치`, () => countRate({ appId, purchaseType: 1, languages: [code] }, `언어 ${code}`))));
  const failedLang = codes.filter((_, i) => langAll[i] === null).length;
  if (failedLang > 6) throw new SteamError(`언어별 수치를 ${failedLang}개 언어에서 받지 못했습니다. 스팀이 요청을 제한하고 있을 수 있어 잠시 후 다시 시도해 주세요.`);
  const sumAll = langAll.reduce((s, r) => s + (r?.total ?? 0), 0) || 1;

  // 4) 분석 기간·직전 기간 언어별 (전체 비중 1% 이상, 최대 12개 + 한국어)
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

  // 5) 플레이타임: 이 게임 리뷰어의 분포(누적 건수)로 사분위를 구해 구간을 정함.
  //    일부 게임(런처 방식 등)은 스팀이 플레이타임을 기록하지 않아, 그럴 땐 구간 분석을 하지 않음.
  await onStep?.("segments");
  const cdf = await collectPlaytimeCdf(appId);
  const covered = Math.max(0, ...cdf.map((p) => p.n));
  const coverage = all.total ? covered / all.total : 0;
  let segments: SegmentRow[] = [];
  let playtime: Stats["profile"]["playtime"] = null;
  if (coverage >= 0.5 && covered >= 100) {
    const { bounds, raw } = segmentBounds(cdf, covered);          // 플레이타임이 기록된 리뷰만으로 분포를 계산
    const defs = segmentDefs(bounds);
    const [segAll, segWin] = await Promise.all([
      tryRate(notes, "플레이타임 구간(전체 기간)", () => collectSegmentRates(appId, defs)),
      tryRate(notes, "플레이타임 구간(분석 기간)", () => collectSegmentRates(appId, defs, win)),
    ]);
    const sumA = (segAll ?? []).reduce((s, r) => s + r.total, 0) || 1, sumW = (segWin ?? []).reduce((s, r) => s + r.total, 0) || 1;
    segments = defs.map((d, i) => ({ ...d, all: segAll?.[i] ?? makeRate(0, 0), window: segWin?.[i] ?? makeRate(0, 0),
      share_all: (100 * (segAll?.[i]?.total ?? 0)) / sumA, share_window: (100 * (segWin?.[i]?.total ?? 0)) / sumW }));
    playtime = { bounds, raw: [Math.round(raw[0] * 10) / 10, Math.round(raw[1] * 10) / 10, Math.round(raw[2] * 10) / 10], reviewers: covered };
    if (coverage < 0.9) notes.push(`리뷰의 ${(coverage * 100).toFixed(0)}%만 스팀에 플레이타임이 기록되어 있어, 플레이타임 구간은 그 리뷰들만으로 계산했습니다.`);
  } else {
    notes.push(`이 게임은 스팀이 플레이타임을 거의 기록하지 않아(리뷰의 ${(coverage * 100).toFixed(1)}%만 기록) 플레이타임별 분석은 하지 않았습니다. (게임 자체 런처 등으로 플레이 시간이 스팀에 잡히지 않는 게임에서 생깁니다)`);
  }

  // 6) 안내문 — 숨기지 않고 화면에 그대로 보여 줌
  if (official.rate != null && all.rate != null && Math.abs(official.rate - all.rate) >= 2)
    notes.push(`스팀 상점 평가 기준(스팀 구매만) 긍정률은 ${official.rate.toFixed(1)}%, 스팀 밖 구매(키 등)까지 합치면 ${all.rate.toFixed(1)}%로 다릅니다.`);
  if (!plan.has_previous) notes.push("리뷰 기록이 짧아 비교할 직전 기간이 없습니다.");
  if (noise == null && plan.has_previous) notes.push(`이 게임의 평소 변동 폭을 알려면 리뷰 30건 이상인 과거 기간이 3개 이상 필요한데 ${used}개뿐이라, 변화는 3%p 이상일 때만 의미 있다고 봤습니다.`);
  if (recent.total < 100) notes.push(`분석 기간 리뷰가 ${recent.total}건뿐이라 이 기간의 비율은 참고용입니다. (리뷰가 적은 게임)`);

  const profile: Stats["profile"] = {
    history_days: history, release_days: releaseDays, genres: info.genres, is_free: info.isFree, early_access: info.earlyAccess,
    volume: { d7: volume.find((v) => v.days === 7)?.n ?? 0, d30: volume.find((v) => v.days === 30)?.n ?? 0, d90: volume.find((v) => v.days === 90)?.n ?? 0 },
    size_class: sizeClass(volume.find((v) => v.days === 30)?.n ?? 0),
    volume_ratio: previous && previous.total > 0 ? recent.total / previous.total : null,
    volume_vs_typical: typical ? recent.total / typical : null,
    previous_vs_typical: typical && previous ? previous.total / typical : null,
    noise_points: noise, baseline_windows: used,
    playtime, playtime_coverage: coverage,
  };
  const stats: Stats = {
    version: 2, fetched_at: new Date().toISOString(),
    official: { ...official, steam_desc_en: official.steam_desc_en },
    all, window: { days: plan.days, start: plan.start, end: plan.end, label: plan.label, reason: plan.reason, has_previous: plan.has_previous, reviews: recent.total },
    profile, recent, previous, delta_points: deltaPoints(recent, previous), delta_notable: notableChange(recent, previous, noise),
    languages, groups: buildGroups(languages), segments,
    sample: { total: 0, languages: [], method: "" }, highlights: [], data_notes: notes,
  };
  stats.highlights = findHighlights(stats);
  return { stats, plan };
}
