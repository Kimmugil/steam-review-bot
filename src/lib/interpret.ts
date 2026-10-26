import { SAMPLE, SEGMENT_KEYS, langName, type SegmentKey } from "./config";
import { segmentOfHours } from "./profile";
import { notableChange } from "./rating";
import type { AiRaw, AiResult, NewsItem, SampleReview, SegmentDef, Stats } from "./types";

/**
 * AI 해석. 역할 분담:
 *  - 숫자(비율·건수·변화)는 전부 코드가 계산해서 '주어진 값'으로만 AI에게 줍니다.
 *  - AI는 표본 리뷰를 읽고 '주제'를 찾고, 근거가 되는 리뷰 '번호'를 가리킵니다. 인용 원문은 AI가 쓰지 않고 코드가 붙입니다.
 *  - 코드는 번호가 실제 있는지 확인하고, 주제의 비중·긍정/부정 성향을 근거 리뷰에서 직접 계산합니다.
 */

const pct = (n: number | null | undefined) => (n == null ? "-" : `${n.toFixed(1)}%`);

function rateLine(name: string, r: { total: number; pos: number; neg: number; rate: number | null; ci: [number, number] | null; label: string }): string {
  return `${name}: ${r.total.toLocaleString()}건 (긍정 ${r.pos.toLocaleString()} / 부정 ${r.neg.toLocaleString()}), 긍정률 ${pct(r.rate)}${r.ci ? ` (95% 범위 ${pct(r.ci[0])}~${pct(r.ci[1])})` : ""}, 등급 ${r.label}`;
}

/** 직전 기간이 이 게임의 평소와 크게 달랐는가 (평소의 2배 이상이거나 절반 이하) — 그러면 '직전 대비 변화'는 평소 모습과의 비교가 아님 */
export function previousIsOdd(stats: Stats): boolean {
  const r = stats.profile.previous_vs_typical;
  return r != null && (r >= 2 || r <= 0.5);
}

/** AI가 직전 대비 변화를 해석해도 되는지: 뚜렷한 변화이고, 비교 대상(직전 기간)이 이례적이지 않을 때만 */
export function mayInterpretChange(stats: Stats): boolean {
  return stats.delta_notable && !previousIsOdd(stats);
}

/** 변화 숫자에 붙는 지시문. 해석 허용 여부를 코드가 정해서 AI에게 알려 줍니다. */
export function changeDirective(stats: Stats): string {
  const odd = previousIsOdd(stats);
  if (stats.delta_notable && !odd) return "뚜렷한 변화(표본 크기로도, 이 게임이 평소 흔들리는 폭으로도 설명되지 않음). 해석해도 된다.";
  if (stats.delta_notable && odd)
    return `통계적으로는 뚜렷하지만, 비교 대상인 직전 기간이 이 게임의 평소의 ${stats.profile.previous_vs_typical!.toFixed(1)}배로 이례적이었다. '개선/악화'로 단정하지 말고 "직전 기간이 이례적이었다"는 점을 함께 써라. change_notes 는 비워라.`;
  return `의미 없는 변화(이 게임이 평소 흔들리는 폭 안이거나 표본이 작음${odd ? `, 게다가 직전 기간이 평소의 ${stats.profile.previous_vs_typical!.toFixed(1)}배로 이례적` : ""}). headline·one_liner·change_notes 어디에서도 이 변화를 상승/하락/개선/악화로 해석하지 마라. change_notes 는 비워라.`;
}

export function buildStatsText(stats: Stats): string {
  const L: string[] = [];
  L.push(rateLine("스팀 상점 기준 전체 평가(스팀 구매, 전 기간)", stats.official));
  L.push(rateLine("스팀 밖 구매 포함 전체", stats.all));
  L.push(rateLine(`${stats.window.label} (${stats.window.start} ~ ${stats.window.end})`, stats.recent));
  if (stats.previous) L.push(rateLine("그 직전 같은 길이 기간", stats.previous));
  if (stats.delta_points != null) L.push(`변화: ${stats.delta_points >= 0 ? "+" : ""}${stats.delta_points.toFixed(1)}%p — ${changeDirective(stats)}`);
  L.push("");
  const odd = previousIsOdd(stats);
  L.push("언어별 (전체 기간, 리뷰 수 비중 큰 순):");
  for (const r of stats.languages.slice(0, 12))
    L.push(`- ${r.name}: 비중 ${pct(r.share)}, 전체 긍정률 ${pct(r.all.rate)} (${r.all.total.toLocaleString()}건)` +
      (r.window ? `, 분석 기간 긍정률 ${pct(r.window.rate)} (${r.window.total.toLocaleString()}건)` : "") +
      (r.prev ? `, 직전 기간 ${pct(r.prev.rate)}${odd ? " (직전 기간이 평소와 달라 변화 비교는 의미 없음)" : notableChange(r.window, r.prev, null) ? " ← 뚜렷한 변화" : " (변화는 표본이 작거나 차이가 작아 우연일 수 있음)"}` : ""));
  if (stats.segments.length) {
    L.push("");
    L.push("플레이타임 구간 (리뷰 쓸 때 기준. 이 게임 리뷰어의 분포를 4등분한 것 — 절대 시간이 아니라 이 게임 안에서의 상대적 위치):");
    for (const s of stats.segments) L.push(`- ${s.label}(${s.range}): 전체 기간 리뷰어의 ${s.share_all.toFixed(0)}%, 분석 기간에는 ${s.share_window.toFixed(0)}% / 긍정률 전체 ${pct(s.all.rate)} (${s.all.total.toLocaleString()}건), 분석 기간 ${pct(s.window.rate)} (${s.window.total.toLocaleString()}건)`);
  } else {
    L.push("");
    L.push("플레이타임: 이 게임은 스팀에 플레이타임이 거의 기록되지 않아 플레이타임 정보가 없다. 플레이타임에 대해 아무것도 쓰지 마라(segment_notes 는 빈 배열).");
  }
  return L.join("\n");
}

const SIZE_KO = { tiny: "리뷰가 매우 적은 게임", small: "리뷰가 적은 게임", medium: "리뷰가 보통인 게임", large: "리뷰가 아주 많은 게임" } as const;

/** 이 게임의 상황(코드가 데이터로 알아낸 것). AI가 게임마다 다르게 해석하도록 알려 줍니다. */
export function buildProfileText(stats: Stats, gameName: string): string {
  const p = stats.profile;
  const age = p.history_days >= 365 ? `약 ${(p.history_days / 365).toFixed(1)}년` : `${p.history_days}일`;
  const L = [
    `- 장르: ${p.genres.length ? p.genres.join(", ") : "알 수 없음"} / ${p.is_free ? "무료 게임" : "유료 게임"}${p.early_access ? " / 얼리 액세스" : ""}`,
    `- 리뷰가 쌓인 기간: ${age}${p.release_days != null && Math.abs(p.release_days - p.history_days) > 60 ? ` (스토어 표시 출시일은 ${p.release_days}일 전이지만 리뷰는 더 오래전부터 있음 — 정식 출시·재출시일 수 있음)` : ""}`,
    ...(p.volume_vs_typical != null ? [`- 이번 기간 리뷰량은 이 게임의 평소의 ${p.volume_vs_typical.toFixed(1)}배${p.previous_vs_typical != null && (p.previous_vs_typical >= 2 || p.previous_vs_typical <= 0.5) ? `이고, 비교 대상인 직전 기간은 평소의 ${p.previous_vs_typical.toFixed(1)}배였습니다(직전 기간이 평소와 달라 비교에 주의)` : ""}.`] : []),
    `- 규모: ${SIZE_KO[p.size_class]} (최근 7일 ${p.volume.d7.toLocaleString()}건, 30일 ${p.volume.d30.toLocaleString()}건, 90일 ${p.volume.d90.toLocaleString()}건)`,
    `- 분석 기간: ${stats.window.label} — ${stats.window.reason}`,
    p.noise_points != null ? `- 이 게임의 긍정률은 평소 기간마다 ±${p.noise_points.toFixed(1)}%p 정도 흔들립니다(과거 ${p.baseline_windows}개 기간 기준). 이보다 작은 변화는 의미를 두지 마세요.` : "- 평소 변동 폭을 알 만한 과거 기간이 부족합니다.",
    p.playtime ? `- 플레이타임 구간은 이 게임 리뷰어 기준 사분위입니다(${p.playtime.bounds[0]}·${p.playtime.bounds[1]}·${p.playtime.bounds[2]}시간 경계). '${gameName}'에서 오래 한 쪽이 다른 게임의 오래 한 쪽과 같은 시간이 아닙니다.` : "- 이 게임은 스팀에 플레이타임이 거의 기록되지 않아 플레이타임 분석을 하지 않습니다.",
  ];
  return L.join("\n");
}

export function formatSample(samples: SampleReview[], defs: Pick<SegmentDef, "key" | "label" | "min" | "max">[]): string {
  const byLang = new Map<string, SampleReview[]>();
  for (const s of samples) byLang.set(s.lang, [...(byLang.get(s.lang) ?? []), s]);
  const blocks: string[] = [];
  for (const [lang, rows] of byLang) {
    blocks.push(`## ${langName(lang)} (표본 ${rows.length}건)`);
    for (const r of rows) {
      const seg = segmentOfHours(r.playtime_h, defs);
      const segLabel = defs.find((x) => x.key === seg)?.label ?? "?";
      blocks.push(`[R${r.n}] ${r.voted_up ? "추천" : "비추천"} | ${r.playtime_h ?? "?"}시간(${segLabel}) | ${r.text.slice(0, SAMPLE.maxChars)}`);
    }
  }
  return blocks.join("\n");
}

export function buildPrompt(gameName: string, stats: Stats, news: NewsItem[], samples: SampleReview[]): string {
  const newsText = news.length
    ? news.map((n, i) => `(${i + 1}) [${n.date}] ${n.title}\n${n.text}`).join("\n\n")
    : "(최근 개발사 공식 공지가 없습니다)";
  const segCounts = stats.segments.map((s) => `${s.key}(${s.label}, ${s.range})=${samples.filter((x) => segmentOfHours(x.playtime_h, stats.segments) === s.key).length}건`).join(", ");
  return `너는 게임 사업 분석가야. 스팀 게임 '${gameName}'의 유저 리뷰를 읽고 해석한다.

[역할 분담 — 반드시 지킬 것]
- 아래 [통계]의 숫자는 이미 코드가 정확히 계산한 값이다. 새 숫자를 만들거나 추정하지 마라. 숫자를 말할 때는 [통계]에 있는 값만 그대로 써라.
- 너는 [리뷰 표본]을 읽고 주제를 찾아 해석한다. 표본은 기간 안에서 무작위로 뽑은 일부일 뿐 전체가 아니다. 그래서 "대다수", "많은 유저" 같은 비중 표현을 쓰지 마라. 비중은 코드가 근거 리뷰 개수로 계산한다.
- 모든 주장은 근거 리뷰 번호(예: R12)로 뒷받침해라. 인용 원문은 네가 쓰지 마라. 번호만 가리키면 코드가 원문을 붙인다.
- 긍정과 부정을 억지로 균형 맞추지 마라. 표본에서 실제로 보이는 것만 써라. 부정이 거의 없으면 부정 주제를 만들지 마라.
- 한 주제는 서로 다른 리뷰 2건 이상이 근거여야 한다. 한 건뿐인 의견은 주제로 만들지 마라.
- 데이터에 없는 것은 "확인할 수 없다"고 써라. 게임에 대한 배경지식으로 사실을 보충하지 마라(검색 도구가 없다).
- 변화(직전 기간 대비)가 '작은 변화'이면 원인을 설명하려 들지 마라. (그 게임이 평소 흔들리는 폭 안의 변화는 아무 일도 아니다) 언어별 변화도 '뚜렷한 변화'로 표시된 것만 언급하고, 나머지는 쓰지 마라. 뚜렷한 변화여도 업데이트나 소식 때문이라고 단정하지 말고 "시기가 겹친다" 정도로만 써라.
- 원인을 추측하지 마라. "~했을 가능성도 있다", "~때문으로 보인다" 같은 문장은 쓰지 마라. 숫자가 보여 주는 사실과, 표본 리뷰에서 유저가 직접 언급한 이유(근거 번호가 있는 것)만 써라. 유저가 언급하지 않은 이유를 네가 만들어 붙이지 마라.
- headline 과 one_liner 는 [통계]의 등급과 [코드가 찾아낸 눈에 띄는 사실]과 어긋나면 안 된다. 예를 들어 전체 등급이 '복합적'인데 "호평"이라고 쓰지 말고, 언어 간 격차가 있으면 headline 에서 그 사실을 먼저 짚어라. 최근 기간과 전체 기간의 평가가 다르면 둘 다 써라.
- 이 분석은 국가가 아니라 '언어' 기준이다. "한국 유저", "미국 유저"가 아니라 "한국어 리뷰", "영어 리뷰"라고 써라.
- 마크다운 기호(**, # 등)와 이모지·이모티콘은 어떤 항목에도 쓰지 마라. 문장은 한국어로.

[분량] 각 summary 는 1~2문장(80자 안팎). themes 최대 8개, language_notes 는 표본이 8건 이상인 언어 중 표본이 많은 상위 6개까지, quotes 최대 6개. JSON 만 출력.

[작성 항목]
- one_liner: 한 줄 요약 (60자 이내, 이모지 없이)
- headline: 핵심 2~3문장
- themes: 표본에서 보이는 주제 최대 8개 (label 짧게, polarity, summary 1~2문장, review_ids)
- language_notes: 표본이 8건 이상인 언어마다 그 언어 리뷰의 특징 (review_ids 는 그 언어 리뷰만, 최대 8개) (language_code는 아래 표본 제목의 언어 코드가 아니라 english, koreana 같은 스팀 코드)
- segment_notes: 플레이타임 구간(q1~q4, 이 게임 리뷰어의 사분위)별 특징. 표본 구간 분포: ${segCounts}. 5건 미만인 구간은 쓰지 마라. review_ids 는 그 구간 라벨이 붙은 리뷰만, 최대 8개만 써라(다른 구간 리뷰를 섞지 마라). 구간 이름은 "초보/고인물" 같은 표현이 아니라 시간 범위로 불러라.
- change_notes: [통계]의 '변화' 줄이 '해석해도 된다'일 때만 직전 기간 대비 변화를 해석 (0~3개). 그 외에는 빈 배열.
- news_notes: [공식 소식]을 본문 기준으로 요약 (소식이 없으면 빈 배열). 제목과 다른 내용을 지어내지 마라.
- quotes: 인용할 만한 리뷰 최대 6개의 번호와 한국어 번역(한국어 리뷰도 그대로 적어도 됨)
- caveats: 이 해석을 읽을 때 조심할 점 (표본이 적은 언어 등)

[이 게임의 상황 — 코드가 이 게임 자신의 데이터로 알아낸 것. 모든 판단은 이 상황 안에서 해라]
${buildProfileText(stats, gameName)}

[통계]
${buildStatsText(stats)}

[코드가 찾아낸 눈에 띄는 사실 — 숫자에서 규칙으로 뽑은 것. 이유를 리뷰에서 찾아 해석해라]
${stats.highlights.length ? stats.highlights.map((h) => `- ${h}`).join("\n") : "- (뚜렷하게 눈에 띄는 격차나 변화는 없음)"}

[공식 소식 — 개발사가 직접 올린 공지]
${newsText}

[리뷰 표본 — 번호는 R1부터 R${samples.length}까지만 존재한다. 이 범위 밖의 번호를 쓰지 마라]
${formatSample(samples, stats.segments)}`;
}

const strArr = { type: "ARRAY", items: { type: "STRING" } };
export const AI_SCHEMA = {
  type: "OBJECT",
  properties: {
    one_liner: { type: "STRING" },
    headline: { type: "STRING" },
    themes: { type: "ARRAY", items: { type: "OBJECT", properties: {
      label: { type: "STRING" }, polarity: { type: "STRING", enum: ["positive", "negative", "mixed"] }, summary: { type: "STRING" }, review_ids: strArr,
    }, required: ["label", "polarity", "summary", "review_ids"] } },
    language_notes: { type: "ARRAY", items: { type: "OBJECT", properties: { language_code: { type: "STRING" }, summary: { type: "STRING" }, review_ids: strArr }, required: ["language_code", "summary", "review_ids"] } },
    segment_notes: { type: "ARRAY", items: { type: "OBJECT", properties: { segment_key: { type: "STRING", enum: ["q1", "q2", "q3", "q4"] }, summary: { type: "STRING" }, review_ids: strArr }, required: ["segment_key", "summary", "review_ids"] } },
    change_notes: strArr,
    news_notes: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, summary: { type: "STRING" } }, required: ["title", "summary"] } },
    quotes: { type: "ARRAY", items: { type: "OBJECT", properties: { review_id: { type: "STRING" }, korean: { type: "STRING" } }, required: ["review_id", "korean"] } },
    caveats: strArr,
  },
  required: ["one_liner", "headline", "themes", "language_notes", "segment_notes", "change_notes", "news_notes", "quotes", "caveats"],
} as const;

const parseId = (x: unknown): number | null => {
  const m = String(x).match(/\d+/);
  return m ? Number(m[0]) : null;
};
/** AI가 쓴 글에서 이모지(그림 문자)와 마크다운 강조를 지운다. 프롬프트로도 금지하지만 코드가 한 번 더 막는다. */
export const stripEmoji = (x: string) => x.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}‍️⃣]/gu, "").replace(/ {2,}/g, " ");
const str = (x: unknown, max = 600) => stripEmoji(String(x ?? "").replace(/\*\*/g, "")).trim().slice(0, max);

/** AI 응답을 검증하고, 비중·성향을 근거 리뷰에서 코드가 계산한 값으로 바꿔 저장 형태로 만듭니다. */
export function finalizeAi(raw: AiRaw, samples: SampleReview[], model: string, segments: Pick<SegmentDef, "key" | "min" | "max">[], opts: { allowChangeNotes?: boolean } = {}): AiResult {
  const byN = new Map(samples.map((s) => [s.n, s]));
  let unknown = 0;
  let emptyThemes = 0;
  const ids = (list: unknown, allow?: (s: SampleReview) => boolean): number[] => {
    const out: number[] = [];
    for (const x of Array.isArray(list) ? list : []) {
      const n = parseId(x);
      const s = n != null ? byN.get(n) : undefined;
      if (!s || (allow && !allow(s))) { unknown++; continue; }
      if (!out.includes(s.n)) out.push(s.n);
    }
    return out;
  };

  const themes: AiResult["themes"] = [];
  for (const t of Array.isArray(raw.themes) ? raw.themes.slice(0, 8) : []) {
    const rids = ids(t.review_ids);
    if (rids.length < 2) { emptyThemes++; continue; }
    const posShare = rids.filter((n) => byN.get(n)!.voted_up).length / rids.length;
    themes.push({
      label: str(t.label, 40), summary: str(t.summary),
      // 주제의 성격(좋았던 점/아쉬운 점)은 AI가 판단한다. 근거 리뷰의 추천 비율은 따로 계산해 보여 준다
      // (불만을 말한 리뷰도 대부분 '추천'일 수 있어서, 둘을 섞으면 오해가 생긴다)
      polarity: t.polarity === "positive" || t.polarity === "negative" ? t.polarity : "mixed",
      stance: posShare >= 0.7 ? "recommend" : posShare <= 0.3 ? "against" : "split",
      support: rids.length, support_share: rids.length / Math.max(1, samples.length), pos_share: posShare, review_ids: rids,
    });
  }
  themes.sort((a, b) => b.support - a.support);

  const langN = (code: string) => samples.filter((s) => s.lang === code).length;
  const language_notes = (Array.isArray(raw.language_notes) ? raw.language_notes : [])
    .filter((n) => langN(n.language_code) >= 8)
    .map((n) => ({ language_code: n.language_code, name: langName(n.language_code), summary: str(n.summary), sample_n: langN(n.language_code),
      review_ids: ids(n.review_ids, (s) => s.lang === n.language_code) }));

  const segN = (k: SegmentKey) => samples.filter((s) => segmentOfHours(s.playtime_h, segments) === k).length;
  const segment_notes = (Array.isArray(raw.segment_notes) ? raw.segment_notes : [])
    .filter((n) => SEGMENT_KEYS.includes(n.segment_key) && segN(n.segment_key) >= 5)
    .map((n) => ({ segment_key: n.segment_key, summary: str(n.summary), sample_n: segN(n.segment_key),
      review_ids: ids(n.review_ids, (s) => segmentOfHours(s.playtime_h, segments) === n.segment_key) }));

  const quotes: AiResult["quotes"] = [];
  for (const q of Array.isArray(raw.quotes) ? raw.quotes : []) {
    const n = parseId(q.review_id);
    const s = n != null ? byN.get(n) : undefined;
    if (!s) { unknown++; continue; }
    if (quotes.some((x) => x.review_id === s.n) || quotes.length >= 6) continue;
    quotes.push({ review_id: s.n, language: s.lang, voted_up: s.voted_up, playtime_h: s.playtime_h, original: s.text.slice(0, 600), korean: s.lang === "koreana" ? "" : str(q.korean) });
  }

  // 변화 해석 문장 속의 R번호(예: R98)가 실제 표본에 있는지 확인한다. 없는 번호를 인용한 문장은 버린다.
  const changeNotes: AiResult["change_notes"] = [];
  // 변화가 뚜렷하지 않거나 비교 대상이 이례적이면 AI의 변화 해석은 받지 않는다(규칙을 어겨도 화면에 나가지 않게 코드가 막음)
  for (const x of opts.allowChangeNotes === false ? [] : Array.isArray(raw.change_notes) ? raw.change_notes : []) {
    const text = str(x);
    if (!text) continue;
    const cited = [...text.matchAll(/R(\d+)/g)].map((m) => Number(m[1]));
    if (cited.some((n) => !byN.has(n))) { unknown += cited.filter((n) => !byN.has(n)).length; emptyThemes++; continue; }
    changeNotes.push({ text, review_ids: [...new Set(cited)] });
    if (changeNotes.length >= 3) break;
  }

  return {
    one_liner: str(raw.one_liner, 90), headline: str(raw.headline, 800),
    themes, language_notes, segment_notes,
    change_notes: changeNotes,
    news_notes: (Array.isArray(raw.news_notes) ? raw.news_notes : []).map((n) => ({ title: str(n.title, 200), summary: str(n.summary, 800) })).slice(0, 3),
    quotes, caveats: (Array.isArray(raw.caveats) ? raw.caveats : []).map((x) => str(x)).filter(Boolean).slice(0, 5),
    model, dropped: { unknown_ids: unknown, empty_themes: emptyThemes },
  };
}
