import { HOURS_LADDER, SEGMENT_KEYS, SEGMENT_LABELS, VOLUME_DAYS, WINDOW } from "./config";
import { makeRate, mean, sd, type Rate } from "./rating";
import { countRate } from "./steam";
import type { SegmentDef, WindowInfo } from "./types";

/**
 * 게임별 상황 파악. 모든 분석 기준(기간·플레이타임 구간·변화 판정)을 '그 게임 자신의 데이터'로 정하기 위한 계산입니다.
 *  - 리뷰 기록의 나이와 기간별 리뷰량 → 분석 기간
 *  - 리뷰어의 플레이타임 분포 → 그 게임의 사분위 구간
 *  - 과거 기간들의 긍정률 흔들림 → 변화가 의미 있는지 판단하는 기준
 */
const DAY = 86400;
const iso = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export type VolumePoint = { days: number; n: number };

export async function collectVolume(appId: number): Promise<VolumePoint[]> {
  const now = Math.floor(Date.now() / 1000);
  return Promise.all(VOLUME_DAYS.map(async (d) => ({ days: d, n: (await countRate({ appId, purchaseType: 1, startTs: now - d * DAY, endTs: now }, `리뷰량 ${d}일`)).total })));
}

/**
 * 리뷰 기록의 나이(일). '전체 리뷰의 99.5% 이상이 쌓인 가장 짧은 눈금'.
 * 스토어 출시일은 1.0 정식 출시·재출시 때 바뀌므로 쓰지 않고, 출시일이 그 눈금 구간 안이면 더 정확한 값으로 씁니다.
 */
export function inferHistoryDays(points: VolumePoint[], total: number, releaseDays: number | null): number {
  const sorted = [...points].sort((a, b) => a.days - b.days);
  const i = sorted.findIndex((p) => p.n >= total * 0.995);
  if (i < 0) return sorted[sorted.length - 1].days;
  const upper = sorted[i].days, lower = i > 0 ? sorted[i - 1].days : 0;
  // 눈금이 촘촘한 구간(180일 이하)은 눈금을 그대로 믿습니다. 출시일보다 먼저 리뷰가 쌓일 수 있어서입니다
  // (사전 구매자의 조기 플레이 등. 출시 '다음 날'인데 리뷰는 이미 7일에 걸쳐 있는 경우가 실제로 있음).
  // 눈금이 거친 구간에서만 출시일로 보정합니다.
  if (lower >= 180 && releaseDays != null && releaseDays > lower && releaseDays <= upper) return releaseDays;
  return upper;
}

export type WindowPlan = WindowInfo & {
  startTs: number; endTs: number;
  prevStartTs: number | null; prevEndTs: number | null;
  baseline: { startTs: number; endTs: number }[];   // 직전 기간 포함, 과거 같은 길이 기간들(변동 폭 계산용)
};

/**
 * 분석 기간 정하기 — 게임의 리뷰량과 나이에 맞춰서.
 *  - 리뷰 기록이 14일 미만: 처음부터 지금까지 (비교할 이전 기간 없음)
 *  - 그 외: 후보(14·30·60·90·180일) 중 목표(1,000건)를 처음 채우는 가장 짧은 기간. 리뷰가 적은 게임은 길게, 많은 게임은 짧게.
 *    단, 직전 같은 길이 기간과 비교할 수 있도록 기록 나이의 절반을 넘지 않음.
 */
export function planWindow(history: number, volume: VolumePoint[], now: Date = new Date()): WindowPlan {
  const endTs = Math.floor(now.getTime() / 1000);
  const n = (d: number) => volume.find((v) => v.days === d)?.n ?? 0;
  const empty = { prevStartTs: null, prevEndTs: null, baseline: [] as WindowPlan["baseline"], has_previous: false, reviews: 0 };
  if (history < 14) {
    // 신작: 처음부터 지금까지 전부. 리뷰 기록 나이는 일 단위로 올림되어 실제 시간이 더 길 수 있으므로, 모든 리뷰가 들어가도록 하루 여유를 둠.
    const days = Math.max(1, history);
    const startTs = endTs - (days + 1) * DAY;
    return { ...empty, days, startTs, endTs, start: iso(endTs - days * DAY), end: iso(endTs), label: `출시 직후 ${days}일 전체`,
      reason: `출시한 지 얼마 안 되어(리뷰 기록 ${days}일) 처음부터 지금까지의 리뷰를 모두 봅니다. 비교할 이전 기간이 없어서 변화는 말하지 않고, 지금 시점의 첫인상을 보여 드립니다.` };
  }
  const cands = WINDOW.candidates.filter((c) => c * 2 <= history);
  let days: number, reason: string;
  if (!cands.length) {
    days = Math.max(WINDOW.minDays, Math.floor(history / 2));
    reason = `리뷰 기록이 ${history}일이라 그 절반(${days}일)을 보고, 직전 같은 길이 기간과 비교합니다.`;
  } else {
    const hit = cands.find((c) => n(c) >= WINDOW.target);
    if (hit) { days = hit; reason = `최근 ${days}일에 리뷰가 ${n(days).toLocaleString()}건 쌓여서(목표 ${WINDOW.target.toLocaleString()}건 이상) 분석하기에 충분한 가장 짧은 기간을 골랐습니다.`; }
    else { days = cands[cands.length - 1]; reason = `리뷰가 적은 게임이라 ${days}일 동안 ${n(days).toLocaleString()}건뿐입니다. 표본을 최대한 모으려고 가능한 가장 긴 ${days}일을 봅니다.`; }
  }
  const startTs = endTs - days * DAY;
  const baseline: WindowPlan["baseline"] = [];
  for (let k = 1; k <= WINDOW.baselineWindows; k++) {
    const s = startTs - k * days * DAY;
    if (s < endTs - history * DAY) break;                          // 리뷰가 쌓이기 전 기간은 쓰지 않음
    baseline.push({ startTs: s, endTs: startTs - (k - 1) * days * DAY });
  }
  const prev = baseline[0] ?? null;
  return { days, startTs, endTs, start: iso(startTs), end: iso(endTs), label: `최근 ${days}일`, reason, reviews: 0,
    has_previous: !!prev, prevStartTs: prev?.startTs ?? null, prevEndTs: prev?.endTs ?? null, baseline };
}

export async function collectBaseline(appId: number, plan: WindowPlan): Promise<Rate[]> {
  return Promise.all(plan.baseline.map((w, i) => countRate({ appId, purchaseType: 1, startTs: w.startTs, endTs: w.endTs }, `과거 기간 ${i + 1}`)));
}

/** 과거 기간들의 긍정률이 평소 흔들리는 폭(%p). 리뷰 30건 이상인 기간이 3개 미만이면 알 수 없음(null). 표본 크기만으로 생기는 흔들림보다는 작게 잡지 않음. */
export function noiseFromWindows(rates: Rate[]): { noise: number | null; used: number } {
  const valid = rates.filter((r) => r.total >= 30 && r.rate != null);
  if (valid.length < 3) return { noise: null, used: valid.length };
  const binomial = mean(valid.map((r) => Math.sqrt(((r.rate! / 100) * (1 - r.rate! / 100)) / r.total) * 100));
  return { noise: Math.max(sd(valid.map((r) => r.rate!)), binomial), used: valid.length };
}

export function sizeClass(d30: number): "tiny" | "small" | "medium" | "large" {
  return d30 < 100 ? "tiny" : d30 < 1000 ? "small" : d30 < 10000 ? "medium" : "large";
}

// ───────────── 플레이타임 분포 → 그 게임의 사분위 ─────────────
export type CdfPoint = { h: number; n: number };

/** 시간 눈금별 '그 시간 이하로 쓴 리뷰' 누적 수 (리뷰 쓸 때 플레이타임 기준) */
export async function collectPlaytimeCdf(appId: number): Promise<CdfPoint[]> {
  return Promise.all(HOURS_LADDER.map(async (h) => ({ h, n: (await countRate({ appId, purchaseType: 1, maxHours: h }, `플레이타임 ≤${h}h`)).total })));
}

/** 누적 분포에서 q 분위(0~1)에 해당하는 시간을 눈금 사이를 직선으로 이어 계산 */
export function quantileHours(cdf: CdfPoint[], total: number, q: number): number {
  const pts = [{ h: 0, c: 0 }, ...[...cdf].sort((a, b) => a.h - b.h).map((p) => ({ h: p.h, c: total ? p.n / total : 0 }))];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].c >= q) {
      const a = pts[i - 1], b = pts[i];
      return b.c === a.c ? b.h : a.h + ((b.h - a.h) * (q - a.c)) / (b.c - a.c);
    }
  }
  return pts[pts.length - 1].h;
}

/** 스팀 API가 정수 시간만 받으므로, 읽기 쉬운 정수로 다듬음 */
export function niceBound(x: number): number {
  if (x < 10) return Math.max(1, Math.round(x));
  if (x < 30) return Math.round(x);
  if (x < 100) return Math.round(x / 5) * 5;
  if (x < 300) return Math.round(x / 10) * 10;
  return Math.round(x / 50) * 50;
}

export function segmentBounds(cdf: CdfPoint[], total: number): { bounds: [number, number, number]; raw: [number, number, number] } {
  const raw: [number, number, number] = [quantileHours(cdf, total, 0.25), quantileHours(cdf, total, 0.5), quantileHours(cdf, total, 0.75)];
  const b1 = niceBound(raw[0]);
  const b2 = Math.max(niceBound(raw[1]), b1 + 1);
  const b3 = Math.max(niceBound(raw[2]), b2 + 1);
  return { bounds: [b1, b2, b3], raw };
}

export function segmentDefs(b: [number, number, number]): SegmentDef[] {
  return [
    { key: SEGMENT_KEYS[0], label: SEGMENT_LABELS.q1, range: `${b[0]}시간 이하`, min: null, max: b[0] },
    { key: SEGMENT_KEYS[1], label: SEGMENT_LABELS.q2, range: `${b[0]}~${b[1]}시간`, min: b[0], max: b[1] },
    { key: SEGMENT_KEYS[2], label: SEGMENT_LABELS.q3, range: `${b[1]}~${b[2]}시간`, min: b[1], max: b[2] },
    { key: SEGMENT_KEYS[3], label: SEGMENT_LABELS.q4, range: `${b[2]}시간 초과`, min: b[2], max: null },
  ];
}

/** 플레이타임이 어느 구간인지: 구간은 (하한, 상한] */
export function segmentOfHours(hours: number | null, defs: Pick<SegmentDef, "key" | "min" | "max">[]): SegmentDef["key"] | null {
  if (hours == null) return null;
  for (const s of defs) if ((s.min == null || hours > s.min) && (s.max == null || hours <= s.max)) return s.key;
  return null;
}

/** 경계(정확히 N시간) 리뷰가 두 구간에 겹쳐 잡히는 것을 바로잡으며 구간별 긍정/부정 수를 받습니다. */
export async function collectSegmentRates(appId: number, defs: SegmentDef[], range?: { startTs: number; endTs: number }): Promise<Rate[]> {
  const q = (extra: { minHours?: number; maxHours?: number }, tag: string) => countRate({ appId, purchaseType: 1, ...(range ?? {}), ...extra }, `플레이타임 ${tag}`);
  const raw = await Promise.all(defs.map((d) => q({ ...(d.min != null ? { minHours: d.min } : {}), ...(d.max != null ? { maxHours: d.max } : {}) }, d.range)));
  const exact = await Promise.all(defs.slice(1).map((d) => q({ minHours: d.min!, maxHours: d.min! }, `=${d.min}h`)));
  return raw.map((r, i) => (i === 0 ? r : makeRate(Math.max(0, r.pos - exact[i - 1].pos), Math.max(0, r.neg - exact[i - 1].neg))));
}
