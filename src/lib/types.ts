import type { Rate } from "./rating";
import type { SegmentKey } from "./config";

export type { Rate };

/** 언어 한 줄: 누적(전체 기간)과 분석 기간·직전 기간 수치 */
export type LangRow = {
  code: string;
  name: string;
  group: string;
  all: Rate;                 // 이 언어의 전체 기간 리뷰
  share: number;             // 전체 리뷰 중 이 언어 비중(%)
  window: Rate | null;       // 분석 기간 (비중 큰 언어만)
  prev: Rate | null;         // 직전 같은 길이 기간
};

export type GroupRow = { group: string; languages: string[]; all: Rate; share: number };

export type SegmentRow = {
  key: SegmentKey; label: string; range: string;
  all: Rate;                 // 전체 기간 중 이 구간 리뷰
  window: Rate;              // 분석 기간 중 이 구간 리뷰
};

export type WindowInfo = {
  days: number;
  start: string;             // YYYY-MM-DD
  end: string;
  label: string;             // '최근 30일'
  reason: string;            // 왜 이 길이를 골랐는지
  has_previous: boolean;
};

export type SampleInfo = {
  total: number;
  languages: { code: string; name: string; n: number; window_total: number }[];
  method: string;            // 표본을 뽑은 방법(화면에 그대로 보여 줌)
};

/** 코드가 계산한 숫자 전부 */
export type Stats = {
  version: 2;
  fetched_at: string;
  official: Rate & { steam_desc_en: string | null; steam_label: string | null };  // 스팀 구매, 전 언어, 전 기간 = 스토어의 '모든 평가'와 같은 기준
  all: Rate;                                           // 스팀 외 구매(키 등) 포함
  window: WindowInfo;
  recent: Rate;                                        // 분석 기간
  previous: Rate | null;                               // 직전 기간
  delta_points: number | null;                         // 분석 기간 − 직전 기간 (퍼센트포인트)
  delta_significant: boolean;                          // 우연으로 설명되지 않는 변화인가
  languages: LangRow[];
  groups: GroupRow[];
  segments: SegmentRow[];
  sample: SampleInfo;
  highlights: string[];                                // 코드가 숫자에서 찾아낸 눈에 띄는 사실 (AI가 쓴 문장이 아님)
  data_notes: string[];                                // 수집 한계·누락 (숨기지 않고 화면에 표시)
};

export type NewsItem = { title: string; date: string; url: string; text: string; feed: string };

/** AI가 돌려주는 해석. 숫자와 인용 원문은 AI가 쓰지 않고, '표본 번호'만 가리킵니다. */
export type AiRaw = {
  one_liner: string;
  headline: string;
  themes: { label: string; polarity: "positive" | "negative" | "mixed"; summary: string; review_ids: string[] }[];
  language_notes: { language_code: string; summary: string; review_ids: string[] }[];
  segment_notes: { segment_key: SegmentKey; summary: string; review_ids: string[] }[];
  change_notes: string[];
  news_notes: { title: string; summary: string }[];
  quotes: { review_id: string; korean: string }[];
  caveats: string[];
};

/** 검증·계산을 거쳐 저장하는 해석 */
export type AiResult = {
  one_liner: string;
  headline: string;
  themes: { label: string; polarity: "positive" | "negative" | "mixed"; stance: "recommend" | "against" | "split"; summary: string; support: number; support_share: number; pos_share: number; review_ids: number[] }[];
  language_notes: { language_code: string; name: string; summary: string; sample_n: number; review_ids: number[] }[];
  segment_notes: { segment_key: SegmentKey; summary: string; sample_n: number; review_ids: number[] }[];
  change_notes: { text: string; review_ids: number[] }[];
  news_notes: { title: string; summary: string }[];
  quotes: { review_id: number; language: string; voted_up: boolean; playtime_h: number | null; original: string; korean: string }[];
  caveats: string[];
  model: string;
  dropped: { unknown_ids: number; empty_themes: number };   // 검증에서 걸러낸 것(투명성)
};

/** 표본 한 건 (DB 저장 단위) */
export type SampleReview = {
  n: number;                 // 이 분석 안에서의 번호 (R1, R2, …)
  rid: string;               // 스팀 리뷰 번호
  lang: string;
  voted_up: boolean;
  playtime_h: number | null;
  text: string;
  ts: number;
};

export type AnalysisRow = {
  id: string;
  app_id: number;
  game_name: string;
  header_image: string | null;
  release_date: string | null;
  status: "queued" | "running" | "done" | "failed";
  step: string | null;
  error: string | null;
  method_version: number;
  hidden: boolean;
  requested_via: string;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  period_days: number | null;
  period_start: string | null;
  period_end: string | null;
  recent_label: string | null;
  smart_reason: string | null;
  all_desc: string | null;
  all_total: number | null;
  recent_desc: string | null;
  recent_total: number | null;
  one_liner: string | null;
  stats: any;   // eslint-disable-line @typescript-eslint/no-explicit-any
  ai: any;      // eslint-disable-line @typescript-eslint/no-explicit-any
  news: any;    // eslint-disable-line @typescript-eslint/no-explicit-any
};
