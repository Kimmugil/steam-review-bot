import { LANG_MAP, REGION_MAP, SCORE_MAP, calculateCustomScore, getLangName, EVAL_LABELS } from "./config";
import type { StoreStats, TableRow, RegionTableRow, NewsData } from "./types";

function sanitizeUrl(url: string): string {
  return url.split("").filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join("").trim();
}

const STEAM_COOKIES = "birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1";
const STEAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Cookie: STEAM_COOKIES,
};

export async function getSteamGameInfo(appId: string): Promise<{
  appId: string; gameName: string; releaseDate: Date; headerImage: string;
} | null> {
  try {
    const url = sanitizeUrl(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=korean`);
    const res = await fetch(url, { headers: STEAM_HEADERS });
    const data = await res.json();
    if (!data?.[appId]?.success) return null;
    const gameData = data[appId].data;
    const gameName = (gameData.name as string).replace(/[^\x00-\x7F]/g, (c: string) => c);
    const headerImage = gameData.header_image ?? "";
    let releaseDate = new Date(2020, 0, 1);
    try {
      const rawDate: string = gameData.release_date?.date ?? "";
      const cleaned = rawDate
        .replace("년 ", "-").replace("월 ", "-").replace("일", "")
        .replace(/[^\d\s-]/g, "").trim();
      const parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) releaseDate = parsed;
    } catch {}
    return { appId, gameName, releaseDate, headerImage };
  } catch {
    return null;
  }
}

async function fetchStoreOfficialRating(appId: string): Promise<string> {
  try {
    const url = sanitizeUrl(`https://store.steampowered.com/app/${appId}/?l=korean`);
    const res = await fetch(url, { headers: STEAM_HEADERS });
    const html = await res.text();
    const match = html.match(/<span class="game_review_summary[^>]*>([^<]+)<\/span>/);
    return match ? match[1].trim() : EVAL_LABELS.none;
  } catch {
    return EVAL_LABELS.none;
  }
}

export async function fetchLatestNews(appId: string): Promise<NewsData> {
  try {
    const url = sanitizeUrl(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=5&maxlength=3000&format=json`
    );
    const res = await fetch(url, { headers: STEAM_HEADERS });
    const json = await res.json();
    const newsItems: Record<string, unknown>[] = json?.appnews?.newsitems ?? [];
    if (!newsItems.length) return { title: null, contents: null, url: null, date: null, image_url: null };

    const parseItem = (item: Record<string, unknown>): NewsData => {
      const date = new Date((item.date as number) * 1000).toISOString().slice(0, 10);
      const contents = (item.contents as string) ?? "";
      let imageUrl: string | null = null;
      const htmlMatch = contents.match(/<img[^>]+src=["'](http[^"']+)['"]/i);
      const bbMatch = contents.match(/\[img\](http.*?)\[\/img\]/i);
      if (htmlMatch) imageUrl = htmlMatch[1];
      else if (bbMatch) imageUrl = bbMatch[1];
      return {
        title: item.title as string,
        contents,
        url: item.url as string,
        date,
        image_url: imageUrl,
      };
    };

    for (const item of newsItems) {
      const title = (item.title as string).toLowerCase();
      if (["update", "patch", "패치", "업데이트"].some((kw) => title.includes(kw))) {
        return parseItem(item);
      }
    }
    return parseItem(newsItems[0]);
  } catch {
    return { title: null, contents: null, url: null, date: null, image_url: null };
  }
}

export function getSmartPeriod(releaseDate: Date): {
  days: number; label: string; reason: string; periodStr: string;
} {
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - releaseDate.getTime()) / 86400000);
  let days: number, label: string, reason: string;

  if (daysSince < 6) {
    days = 3;
    label = "출시 초기";
    reason = "출시 직후 민심을 파악하기 위해 오픈 시점부터의 동향을 분석했습니다.";
  } else if (daysSince < 40) {
    days = Math.floor(daysSince / 2);
    label = `최근 ${days}일`;
    reason = "오픈 초기 노이즈를 배제하기 위해 출시일의 절반인 기간의 동향을 분석했습니다.";
  } else {
    days = 30;
    label = "최근 30일";
    reason = "서비스가 안정화된 상태로 장기 동향을 분석했습니다.";
  }

  const start = new Date(now.getTime() - days * 86400000);
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const periodStr = `${fmt(start)} ~ ${fmt(now)}`;
  return { days, label, reason, periodStr };
}

async function fetchLangStats(appId: string, lang: string): Promise<{ lang: string; total: number; positive: number }> {
  try {
    const url = sanitizeUrl(
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&num_per_page=0&purchase_type=all`
    );
    const res = await fetch(url, { headers: STEAM_HEADERS });
    const json = await res.json();
    const qs = json?.query_summary ?? {};
    return { lang, total: qs.total_reviews ?? 0, positive: qs.total_positive ?? 0 };
  } catch {
    return { lang, total: 0, positive: 0 };
  }
}

async function fetchLangReviews(
  appId: string, lang: string, dayRange: number | null = null, limit = 40
): Promise<Array<{ language: string; is_positive: boolean; playtime: number; review: string }>> {
  const reviews: Array<{ language: string; is_positive: boolean; playtime: number; review: string }> = [];
  const filterType = dayRange ? "recent" : "all";
  let baseUrl = sanitizeUrl(
    `https://store.steampowered.com/appreviews/${appId}?json=1&filter=${filterType}&language=${lang}&num_per_page=100&purchase_type=all`
  );
  if (dayRange) baseUrl += `&day_range=${dayRange}`;
  let cursor = "*";

  for (let i = 0; i < 3; i++) {
    try {
      const url = baseUrl + `&cursor=${encodeURIComponent(cursor)}`;
      const res = await fetch(url, { headers: STEAM_HEADERS });
      const json = await res.json();
      if (!json?.reviews?.length) break;
      for (const r of json.reviews) {
        reviews.push({
          language: lang,
          is_positive: Boolean(r.voted_up),
          playtime: Math.round((r.author?.playtime_at_review ?? 0) / 60 * 10) / 10,
          review: (r.review as string).slice(0, 400).replace(/\n/g, " "),
        });
      }
      cursor = json.cursor ?? "*";
      if (!cursor) break;
    } catch {
      break;
    }
  }
  return reviews.slice(0, limit);
}

function summaryLimit(ratio: number): number {
  if (ratio >= 0.05) return 20;
  if (ratio >= 0.02) return 10;
  return 5;
}

function buildLangTable(
  langData: Record<string, { total: number; positive: number }>,
  total: number
): TableRow[] {
  return Object.entries(langData)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([code, stat], i) => ({
      rank: `${i + 1}위`,
      lang: getLangName(code).split(" ").slice(1).join(" ").trim(),
      lang_with_flag: getLangName(code),
      count: stat.total,
      ratio: total > 0 ? `${((stat.total / total) * 100).toFixed(1)}%` : "0%",
      pos_ratio: `${((stat.positive / stat.total) * 100).toFixed(1)}%`,
      neg_ratio: `${(((stat.total - stat.positive) / stat.total) * 100).toFixed(1)}%`,
      eval: calculateCustomScore(stat.positive / stat.total, stat.total),
    }));
}

function buildRegionTable(
  langData: Record<string, { total: number; positive: number }>,
  total: number
): RegionTableRow[] {
  const regStat: Record<string, { total: number; positive: number }> = {};
  for (const [lang, stat] of Object.entries(langData)) {
    const region = REGION_MAP[lang] ?? "🌐 기타";
    if (!regStat[region]) regStat[region] = { total: 0, positive: 0 };
    regStat[region].total += stat.total;
    regStat[region].positive += stat.positive;
  }
  return Object.entries(regStat)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([region, stat], i) => ({
      rank: `${i + 1}위`,
      region,
      count: stat.total,
      ratio: total > 0 ? `${((stat.total / total) * 100).toFixed(1)}%` : "0%",
      pos_ratio: `${((stat.positive / stat.total) * 100).toFixed(1)}%`,
      neg_ratio: `${(((stat.total - stat.positive) / stat.total) * 100).toFixed(1)}%`,
      eval: calculateCustomScore(stat.positive / stat.total, stat.total),
    }));
}

export async function fetchSteamReviews(
  appId: string,
  recentDaysVal: number,
  releaseDate: Date,
  periodStr: string
): Promise<{
  filteredAll: Record<string, string[]>;
  filteredRecent: Record<string, string[]>;
  storeStats: StoreStats;
  actualRecentLabel: string | null; // null = 의도한 기간 그대로, 값 있으면 실제 수집 기간으로 보정됨
}> {
  const now = new Date();
  const daysSinceRelease = Math.floor((now.getTime() - releaseDate.getTime()) / 86400000);

  // ── Phase 1: parallel stats for all 30 languages ──
  const allLangs = Object.keys(LANG_MAP);
  const statResults = await Promise.all(allLangs.map((lang) => fetchLangStats(appId, lang)));
  const langStatsAll: Record<string, { total: number; positive: number }> = {};
  let sumTotal = 0, sumPos = 0;
  for (const { lang, total, positive } of statResults) {
    if (total > 0) {
      langStatsAll[lang] = { total, positive };
      sumTotal += total;
      sumPos += positive;
    }
  }

  // Official rating
  let officialDesc = await fetchStoreOfficialRating(appId);
  if (!officialDesc || officialDesc === EVAL_LABELS.none) {
    try {
      const url = sanitizeUrl(
        `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&num_per_page=0&purchase_type=steam`
      );
      const res = await fetch(url, { headers: STEAM_HEADERS });
      const json = await res.json();
      const qs = json?.query_summary ?? {};
      const code = qs.review_score ?? 0;
      if (code === 0 && qs.total_reviews > 0) {
        officialDesc = calculateCustomScore(qs.total_positive / qs.total_reviews, qs.total_reviews);
      } else {
        officialDesc = SCORE_MAP[code] ?? EVAL_LABELS.none;
      }
    } catch {}
  }

  const allDesc = sumTotal > 0 ? calculateCustomScore(sumPos / sumTotal, sumTotal) : EVAL_LABELS.none;

  // ── Phase 2: recent period stats ──
  const langStats30: Record<string, { total: number; positive: number }> = {};
  let recentTotal = 0, recentPos = 0;

  if (recentDaysVal) {
    if (daysSinceRelease < 4) {
      const url = sanitizeUrl(
        `https://store.steampowered.com/appreviews/${appId}?json=1&filter=recent&language=all&num_per_page=100&purchase_type=all`
      );
      let cursor = "*";
      const rawReviews: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 5; i++) {
        try {
          const res = await fetch(url + `&cursor=${encodeURIComponent(cursor)}`, { headers: STEAM_HEADERS });
          const json = await res.json();
          if (!json?.reviews?.length) break;
          rawReviews.push(...json.reviews);
          cursor = json.cursor ?? "*";
          if (!cursor) break;
        } catch { break; }
      }
      const cutoff = Math.max(1, Math.floor(rawReviews.length * 0.3));
      for (const r of rawReviews.slice(0, cutoff)) {
        recentTotal++;
        if (r.voted_up) recentPos++;
        const rLang = r.language as string;
        if (rLang && allLangs.includes(rLang)) {
          if (!langStats30[rLang]) langStats30[rLang] = { total: 0, positive: 0 };
          langStats30[rLang].total++;
          if (r.voted_up) langStats30[rLang].positive++;
        }
      }
    } else {
      const cutoffTs = Math.floor((now.getTime() - recentDaysVal * 86400000) / 1000);
      const url = sanitizeUrl(
        `https://store.steampowered.com/appreviews/${appId}?json=1&filter=recent&language=all&num_per_page=100&purchase_type=all`
      );
      let cursor = "*";
      // A: cap at 20 iterations (~2,000 reviews max) instead of 50
      // C: hard 30-second deadline so popular games can't blow past the Vercel limit
      const scanDeadline = Date.now() + 30_000;
      let actualOldestTs: number | null = null; // 실제로 수집된 가장 오래된 리뷰의 timestamp
      outer: for (let i = 0; i < 20; i++) {
        if (Date.now() > scanDeadline) break; // C: timeout cutoff
        try {
          const res = await fetch(url + `&cursor=${encodeURIComponent(cursor)}`, { headers: STEAM_HEADERS });
          const json = await res.json();
          if (!json?.reviews?.length) break;
          for (const r of json.reviews as Array<Record<string, unknown>>) {
            const ts = r.timestamp_created as number;
            if (ts < cutoffTs) break outer;
            recentTotal++;
            if (r.voted_up) recentPos++;
            const rLang = r.language as string;
            if (rLang && allLangs.includes(rLang)) {
              if (!langStats30[rLang]) langStats30[rLang] = { total: 0, positive: 0 };
              langStats30[rLang].total++;
              if (r.voted_up) langStats30[rLang].positive++;
            }
            // 가장 오래된 수집 timestamp 갱신 (reviews는 최신→오래된 순 정렬)
            actualOldestTs = ts;
          }
          cursor = json.cursor ?? "*";
          if (!cursor) break;
        } catch { break; }
      }
    }
  }

  // ── 실제 수집 기간 보정 ──
  // actualOldestTs가 cutoffTs보다 크면(= 의도한 기간을 다 못 채움) 실제 기간으로 교체
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  let actualPeriodStr = periodStr;
  let actualRecentLabel: string | null = null;
  if (actualOldestTs !== null) {
    const actualDays = Math.ceil((now.getTime() / 1000 - actualOldestTs) / 86400);
    if (actualDays < recentDaysVal) {
      const actualStart = new Date(actualOldestTs * 1000);
      actualPeriodStr = `${fmtDate(actualStart)} ~ ${fmtDate(now)}`;
      actualRecentLabel = `최근 ${actualDays}일`;
    }
  }

  const recentDesc = recentTotal > 0 ? calculateCustomScore(recentPos / recentTotal, recentTotal) : EVAL_LABELS.none;
  const tableDataAll = buildLangTable(langStatsAll, sumTotal);
  const flagToCode = Object.fromEntries(Object.keys(langStatsAll).map((l) => [getLangName(l), l]));

  // ── Phase 3: determine collection roles per language ──
  const minThreshold = Math.max(10, Math.floor(sumTotal * 0.01));
  const summaryLangsMap: Record<string, number> = {};
  for (const row of tableDataAll) {
    const code = flagToCode[row.lang_with_flag];
    if (!code || !langStatsAll[code]) continue;
    if (langStatsAll[code].total < minThreshold) continue;
    const ratio = langStatsAll[code].total / sumTotal;
    summaryLangsMap[code] = summaryLimit(ratio);
  }
  const summaryLangsCoverage = sumTotal > 0
    ? Math.round(Object.keys(summaryLangsMap).reduce((s, c) => s + (langStatsAll[c]?.total ?? 0), 0) / sumTotal * 1000) / 10
    : 0;

  const regionPrefixes = ["동아시아", "동남아시아", "영미권", "서유럽", "동유럽", "북유럽", "CIS(러시아권)", "중남미", "중동·기타"];
  const regionLangsMap: Record<string, number> = {};
  for (const prefix of regionPrefixes) {
    const inRegion = Object.keys(langStatsAll).filter((l) => (REGION_MAP[l] ?? "").includes(prefix));
    const top3 = inRegion.sort((a, b) => langStatsAll[b].total - langStatsAll[a].total).slice(0, 3);
    for (const lang of top3) regionLangsMap[lang] = 15;
  }

  const top3Codes: string[] = [];
  for (const row of tableDataAll) {
    const code = flagToCode[row.lang_with_flag];
    if (code && langStatsAll[code]) top3Codes.push(code);
    if (top3Codes.length >= 3) break;
  }
  const countryLangsOrdered = [...top3Codes];
  if (!countryLangsOrdered.includes("koreana")) countryLangsOrdered.push("koreana");

  const issueLangsMap: Record<string, number> = {};
  if (Object.keys(langStats30).length) {
    const top5Recent = Object.entries(langStats30)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([l]) => l);
    for (const lang of top5Recent) issueLangsMap[lang] = 10;
  }

  const langLimitMap: Record<string, number> = {};
  for (const [lang, lim] of Object.entries(issueLangsMap)) langLimitMap[lang] = Math.max(langLimitMap[lang] ?? 0, lim);
  for (const [lang, lim] of Object.entries(regionLangsMap)) langLimitMap[lang] = Math.max(langLimitMap[lang] ?? 0, lim);
  for (const [lang, lim] of Object.entries(summaryLangsMap)) langLimitMap[lang] = Math.max(langLimitMap[lang] ?? 0, lim);
  for (const lang of countryLangsOrdered) langLimitMap[lang] = Math.max(langLimitMap[lang] ?? 0, 40);

  // ── Phase 4: fetch review texts in parallel ──
  const filteredAll: Record<string, string[]> = {};
  const filteredRecent: Record<string, string[]> = {};
  const allReviewsForPt: Array<{ pt: number; pos: boolean }> = [];

  await Promise.all(
    Object.entries(langLimitMap).map(async ([lang, fetchLimit]) => {
      const allRevs = await fetchLangReviews(appId, lang, null, fetchLimit);
      allReviewsForPt.push(...allRevs.map((r) => ({ pt: r.playtime, pos: r.is_positive })));
      const langLabel = getLangName(lang);
      filteredAll[lang] = allRevs.map(
        (r) => `[${r.is_positive ? "👍" : "👎"} | 🌐 ${langLabel} | ⏱️ ${r.playtime}h] ${r.review}`
      );
      if (recentDaysVal) {
        const issueLimit = issueLangsMap[lang] ?? 0;
        const recLimit = Math.max(fetchLimit, issueLimit);
        const recRevs = await fetchLangReviews(appId, lang, recentDaysVal, recLimit);
        filteredRecent[lang] = recRevs.map(
          (r) => `[${r.is_positive ? "👍" : "👎"} | 🌐 ${langLabel} | ⏱️ ${r.playtime}h] ${r.review}`
        );
      } else {
        filteredRecent[lang] = filteredAll[lang];
      }
    })
  );

  // ── Phase 5: playtime segmentation ──
  allReviewsForPt.sort((a, b) => a.pt - b.pt);
  const n = allReviewsForPt.length;
  const q1 = Math.floor(n / 4);
  const q3 = Math.floor((n * 3) / 4);
  const newbies = n >= 4 ? allReviewsForPt.slice(0, q1) : allReviewsForPt;
  const normals = n >= 4 ? allReviewsForPt.slice(q1, q3) : [];
  const cores = n >= 4 ? allReviewsForPt.slice(q3) : [];

  function calcPtStats(group: Array<{ pt: number; pos: boolean }>): [number, number, string] {
    if (!group.length) return [0, 0, EVAL_LABELS.none];
    const pos = group.filter((x) => x.pos).length;
    const avg = Math.round(group.reduce((s, x) => s + x.pt, 0) / group.length * 10) / 10;
    return [avg, group.length, calculateCustomScore(pos / group.length, group.length)];
  }

  const [nAvg, nTot, nDesc] = calcPtStats(newbies);
  const [normAvg, normTot, normDesc] = calcPtStats(normals);
  const [cAvg, cTot, cDesc] = calcPtStats(cores);

  const storeStats: StoreStats = {
    official_desc: officialDesc,
    all_desc: allDesc,
    all_total: sumTotal,
    recent_desc: recentDesc,
    recent_total: recentTotal,
    table_data_all: tableDataAll,
    table_data_30: buildLangTable(langStats30, Object.values(langStats30).reduce((s, v) => s + v.total, 0)),
    table_data_region: buildRegionTable(langStatsAll, sumTotal),
    days_since_release: daysSinceRelease,
    newbie_avg: nAvg, newbie_total: nTot, newbie_desc: nDesc,
    norm_avg: normAvg, norm_total: normTot, norm_desc: normDesc,
    core_avg: cAvg, core_total: cTot, core_desc: cDesc,
    collection_period: actualPeriodStr, // A+C로 잘린 경우 실제 수집 기간으로 보정
    country_langs_ordered: countryLangsOrdered,
    summary_langs: Object.keys(summaryLangsMap),
    summary_coverage: summaryLangsCoverage,
    region_langs: Object.keys(regionLangsMap),
    issue_langs: Object.keys(issueLangsMap),
  };

  return { filteredAll, filteredRecent, storeStats, actualRecentLabel };
}
