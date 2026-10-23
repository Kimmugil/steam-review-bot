/** 화면 표시용 서식 (한국 시간 기준) */
const KST = "Asia/Seoul";

export function dateKo(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, year: "numeric", month: "long", day: "numeric" }).format(d);
  if (!withTime) return date;
  return `${date} ${new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)}`;
}

export const pct1 = (n: number | null | undefined) => (n == null ? "-" : `${n.toFixed(1)}%`);
export const num = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ko-KR"));
export const signed = (n: number | null | undefined, unit = "%p") => (n == null ? "-" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}${unit}`);

/** 평가 이름 → 색 (좋음/보통/나쁨/없음) */
export function tone(label: string | null | undefined): "good" | "warn" | "bad" | "plain" {
  if (!label || label.includes("없음")) return "plain";
  if (label.includes("긍정")) return "good";
  if (label.includes("부정")) return "bad";
  return "warn";
}

export const STEP_LABELS: Record<string, string> = {
  game_info: "게임 정보 확인",
  stats: "스팀에서 리뷰 숫자 수집",
  segments: "플레이타임 구간 계산",
  news: "개발사 공지 확인",
  reviews: "리뷰 표본 뽑기",
  ai: "AI가 리뷰 읽고 해석",
  saving: "결과 저장",
};
export const STEP_ORDER = ["game_info", "stats", "segments", "news", "reviews", "ai", "saving"];

/** 문구 안의 {이름} 자리를 값으로 채움 */
export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
