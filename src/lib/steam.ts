import type { NewsItem } from "./types";
import { makeRate, steamScoreLabel, type Rate } from "./rating";

/**
 * 스팀 통신. 원칙:
 *  1) 요청은 동시에 몇 개까지만, 간격을 두고 보냅니다 (제한에 걸리지 않도록).
 *  2) 일시 오류(429·5xx·네트워크)는 기다렸다가 다시 시도합니다.
 *  3) 끝내 실패하면 0으로 바꿔 숨기지 않고 SteamError 로 올립니다. (호출한 쪽이 '누락'으로 표시할지 중단할지 정함)
 */
const REVIEWS_URL = "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";
const UA = "Mozilla/5.0 (compatible; SteamThresher/4.0; +https://github.com/Kimmugil/steam-review-bot)";

export class SteamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SteamError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 동시에 최대 N개, 시작 간격 최소 gap ms */
function makeLimiter(concurrency: number, gapMs: number) {
  let active = 0;
  let lastStart = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (!run) return;
    active++;
    run();
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      const wait = lastStart + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}
const limit = makeLimiter(4, 100);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function fetchJson(url: string, label: string, retries = 5): Promise<Json> {
  let last = "";
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await limit(() => fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(25_000) }));
      if (res.status === 200) {
        try {
          return (await res.json()) as Json;
        } catch {
          last = "JSON이 아닌 응답";
        }
      } else if (res.status === 429 || res.status >= 500 || (res.status >= 300 && res.status < 400)) {
        last = `상태 ${res.status}`;
        await sleep(Math.min(2000 * 2 ** attempt, 30_000));
        continue;
      } else {
        throw new SteamError(`${label}: 스팀이 요청을 거절했습니다 (상태 ${res.status})`, res.status);
      }
    } catch (e) {
      if (e instanceof SteamError) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(Math.min(1000 * 2 ** attempt, 15_000));
  }
  throw new SteamError(`${label}: 스팀에서 응답을 받지 못했습니다 (${last})`);
}

// ───────────────── 리뷰 ─────────────────
export type ReviewQuery = {
  appId: number;
  languages?: string[];          // 기본: 전체
  filter?: 0 | 1 | 2;            // 0 도움순, 1 최신순, 2 수정순.  이 프로그램은 항상 1(최신순)을 씁니다.
  purchaseType?: 0 | 1;          // 0 스팀 구매만, 1 전부
  reviewType?: 0 | 1 | 2;
  startTs?: number;              // 작성 시각 범위 (초)
  endTs?: number;
  minHours?: number;             // 리뷰 쓸 때 플레이타임 하한(이상)
  maxHours?: number;             // 상한(이하)
  perPage?: number;
  cursor?: string;
};

export type RawReview = {
  recommendationid: string;
  author: { playtime_at_review?: number; playtime_forever?: number };
  language: string;
  review: string;
  timestamp_created: number;
  voted_up: boolean;
};

export type ReviewPage = {
  pos: number; neg: number; total: number;       // 요청 조건에 맞는 전체 건수(페이지 크기와 무관)
  scoreCode: number | null; scoreDescEn: string | null;
  reviews: RawReview[]; cursor: string | null;
};

export async function getReviewPage(q: ReviewQuery, label: string): Promise<ReviewPage> {
  const input: Json = {
    appid: q.appId,
    languages: q.languages ?? ["all"],
    filter: q.filter ?? 1,
    purchase_type: q.purchaseType ?? 1,
    review_type: q.reviewType ?? 0,
    num_per_page: q.perPage ?? 1,
    cursor: q.cursor ?? "*",
  };
  if (q.startTs != null && q.endTs != null) { input.date_range_start = q.startTs; input.date_range_end = q.endTs; }
  if (q.minHours != null) input.playtime_min_hours = q.minHours;
  if (q.maxHours != null) input.playtime_max_hours = q.maxHours;
  const url = `${REVIEWS_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
  const json = await fetchJson(url, label);
  const r = json.response;
  if (!r || typeof r !== "object" || !r.query_summary) throw new SteamError(`${label}: 응답 형식이 예상과 다릅니다`);
  const s = r.query_summary;
  return {
    pos: Number(s.total_positive ?? 0), neg: Number(s.total_negative ?? 0), total: Number(s.total_reviews ?? 0),
    scoreCode: s.review_score != null ? Number(s.review_score) : null, scoreDescEn: s.review_score_desc ?? null,
    reviews: Array.isArray(r.reviews) ? (r.reviews as RawReview[]) : [], cursor: r.cursor ?? null,
  };
}

/** 조건에 맞는 리뷰의 긍정/부정 수 (호출 1번, 리뷰 본문은 안 받음) */
export async function countRate(q: ReviewQuery, label: string): Promise<Rate> {
  const p = await getReviewPage({ ...q, perPage: 1 }, label);
  return makeRate(p.pos, p.neg);
}

/** 스팀 '모든 평가'와 같은 기준(스팀 구매, 전 언어, 전 기간)의 수치와 스팀이 매긴 등급 */
export async function getOfficial(appId: number): Promise<Rate & { steam_desc_en: string | null; steam_label: string | null }> {
  const p = await getReviewPage({ appId, purchaseType: 0, perPage: 1 }, "공식 평가");
  return { ...makeRate(p.pos, p.neg), steam_desc_en: p.scoreDescEn, steam_label: steamScoreLabel(p.scoreCode) };
}

// ───────────────── 게임 정보 ─────────────────
export type GameInfo = {
  appId: number; name: string; headerImage: string | null;
  releaseDate: Date | null; comingSoon: boolean; type: string | null;
};

/** 한국어 '2025년 1월 20일' 과 영어 '20 Jan, 2025' 모두 읽습니다. 못 읽으면 null. */
export function parseReleaseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const ko = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (ko) return new Date(Date.UTC(+ko[1], +ko[2] - 1, +ko[3]));
  const t = Date.parse(raw + " UTC");
  return Number.isNaN(t) ? null : new Date(t);
}

export async function getGameInfo(appId: number): Promise<GameInfo | null> {
  const json = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=korean`, "게임 정보");
  const node = json[String(appId)];
  if (!node?.success || !node.data) return null;
  const d = node.data;
  return {
    appId, name: String(d.name ?? appId), headerImage: d.header_image ?? null,
    releaseDate: parseReleaseDate(d.release_date?.date), comingSoon: Boolean(d.release_date?.coming_soon), type: d.type ?? null,
  };
}

// ───────────────── 공식 소식 ─────────────────
/** BBCode·HTML 꼬리표를 걷어 낸 읽을 수 있는 글 */
export function cleanNewsText(raw: string, max = 1500): string {
  return raw
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\{STEAM_CLAN_IMAGE\}\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}

/** 개발사가 직접 올린 공지(feed_type=1)만. 언론 기사(타 사이트 글)는 '공식 소식'이 아니므로 제외. */
export async function getOfficialNews(appId: number, maxItems = 3, sinceDays = 120): Promise<NewsItem[]> {
  const json = await fetchJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=20&maxlength=0&format=json`, "소식");
  const items: Json[] = json?.appnews?.newsitems ?? [];
  const cutoff = Date.now() / 1000 - sinceDays * 86400;
  return items
    .filter((x) => x.feed_type === 1 && x.date >= cutoff)
    .slice(0, maxItems)
    .map((x) => ({
      title: String(x.title ?? ""),
      date: new Date(x.date * 1000).toISOString().slice(0, 10),
      url: String(x.url ?? ""),
      text: cleanNewsText(String(x.contents ?? "")),
      feed: String(x.feedname ?? ""),
    }));
}

/** 게임 이름이나 주소에서 App ID를 뽑습니다. */
export function parseAppId(input: string): number | null {
  const s = input.trim();
  if (/^\d{1,9}$/.test(s)) return Number(s);
  const m = s.match(/store\.steampowered\.com\/app\/(\d{1,9})/i);
  return m ? Number(m[1]) : null;
}
