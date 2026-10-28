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

/** 플레이타임 구간 정의: 그 게임 리뷰어의 사분위로 정한 시간 경계. 구간은 (min, max] */
export type SegmentDef = { key: SegmentKey; label: string; range: string; min: number | null; max: number | null };

export type SegmentRow = SegmentDef & {
  all: Rate;                 // 전체 기간 중 이 구간 리뷰
  window: Rate;              // 분석 기간 중 이 구간 리뷰
  share_all: number;         // 전체 기간 리뷰어 중 이 구간 비중(%) — 사분위라 약 25%
  share_window: number;      // 분석 기간 리뷰어 중 이 구간 비중(%) — 전체와 다르면 리뷰어 구성이 바뀌었다는 신호
};

/** 코드가 이 게임 자체의 데이터로 알아낸 상황. 분석 기준(기간·구간·변화 판정)의 근거입니다. */
export type GameProfile = {
  history_days: number;                 // 리뷰가 쌓인 기간(나이). 출시일이 아니라 리뷰 기록으로 잼
  release_days: number | null;          // 스토어 출시일로부터 일수 (재출시·1.0 등은 history 와 다를 수 있음)
  genres: string[]; is_free: boolean; early_access: boolean;
  volume: { d7: number; d30: number; d90: number };
  size_class: "tiny" | "small" | "medium" | "large";   // 최근 30일 리뷰량 기준
  volume_ratio: number | null;          // 분석 기간 리뷰 수 ÷ 직전 기간 리뷰 수
  volume_vs_typical: number | null;     // 분석 기간 리뷰 수 ÷ 과거 기간들의 중앙값 (평소 대비). 과거 기간 3개 미만이면 null
  previous_vs_typical: number | null;   // 직전 기간 리뷰 수 ÷ 중앙값 — 직전 기간이 평소와 달랐는지(몰린 때인지)
  noise_points: number | null;          // 이 게임이 평소 기간마다 흔들리는 긍정률 폭(%p). 과거 기간이 부족하면 null
  baseline_windows: number;             // 변동 폭을 계산에 쓴 과거 기간 수
  playtime: { bounds: [number, number, number]; raw: [number, number, number]; reviewers: number } | null;  // 사분위 경계(시간). 스팀이 플레이타임을 기록하지 않는 게임이면 null
  playtime_coverage: number;            // 리뷰 중 플레이타임이 기록된 비율(0~1)
};

export type WindowInfo = {
  days: number;
  start: string;             // YYYY-MM-DD
  end: string;
  label: string;             // '최근 30일'
  reason: string;            // 왜 이 길이를 골랐는지
  has_previous: boolean;
  reviews: number;           // 분석 기간 리뷰 수
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
  profile: GameProfile;
  recent: Rate;                                        // 분석 기간
  previous: Rate | null;                               // 직전 기간
  delta_points: number | null;                         // 분석 기간 − 직전 기간 (퍼센트포인트)
  delta_notable: boolean;                              // 통계적으로 뚜렷하고, 이 게임의 평소 변동 폭보다 큰 변화인가
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
  quote_rule?: { rate: number | null; pos: number; neg: number };   // 대표 리뷰를 고른 조건 (예전 분석에는 없음)
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
