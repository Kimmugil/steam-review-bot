/** 평가 등급과 신뢰 구간 계산 (숫자는 전부 코드가 계산합니다). */

export type Rate = {
  total: number;
  pos: number;
  neg: number;
  rate: number | null;          // 긍정 비율 0~100
  ci: [number, number] | null;  // 95% 신뢰 구간 (%)
  label: string;                // 스팀 방식의 등급 이름 (표본이 너무 적으면 '평가 없음')
  reliable: boolean;            // 표본이 충분한가 (30건 이상)
};

/** Wilson 구간: 표본이 작을수록 폭이 넓어집니다. */
export function wilson(pos: number, total: number, z = 1.96): [number, number] | null {
  if (total <= 0) return null;
  const p = pos / total;
  const d = 1 + (z * z) / total;
  const c = p + (z * z) / (2 * total);
  const m = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [Math.max(0, ((c - m) / d) * 100), Math.min(100, ((c + m) / d) * 100)];
}

/**
 * 스팀 상점의 등급 구간을 따른 이름 붙이기.
 *  리뷰 10건 미만: 평가 없음 / 긍정 80% 이상: 50건 이상 '매우 긍정적'(95%↑·500건↑ 이면 '압도적'), 50건 미만 '긍정적'
 *  70~79% 대체로 긍정적 / 40~69% 복합적 / 20~39% 대체로 부정적
 *  20% 미만: 10~49건 '부정적', 50건 이상 '매우 부정적', 500건 이상 '압도적으로 부정적'
 */
export function ratingLabel(pos: number, total: number): string {
  if (total < 10) return "평가 없음";
  const r = (pos / total) * 100;
  if (r >= 80) {
    if (total < 50) return "긍정적";
    if (r >= 95 && total >= 500) return "압도적으로 긍정적";
    return "매우 긍정적";
  }
  if (r >= 70) return "대체로 긍정적";
  if (r >= 40) return "복합적";
  if (r >= 20) return "대체로 부정적";
  if (total < 50) return "부정적";
  return total >= 500 ? "압도적으로 부정적" : "매우 부정적";
}

export function makeRate(pos: number, neg: number): Rate {
  const total = pos + neg;
  return {
    total, pos, neg,
    rate: total > 0 ? (pos / total) * 100 : null,
    ci: wilson(pos, total),
    label: ratingLabel(pos, total),
    reliable: total >= 30,
  };
}

/** 스팀이 직접 알려주는 등급 번호(1~9) → 한국어 이름. 스팀 한국어 상점의 표기를 따름. */
const STEAM_SCORE_KO: Record<number, string> = {
  1: "압도적으로 부정적", 2: "매우 부정적", 3: "부정적", 4: "대체로 부정적", 5: "복합적",
  6: "대체로 긍정적", 7: "긍정적", 8: "매우 긍정적", 9: "압도적으로 긍정적",
};
export function steamScoreLabel(score: number | undefined | null): string | null {
  return score && STEAM_SCORE_KO[score] ? STEAM_SCORE_KO[score] : null;
}

/** 긍정 비율 차이(퍼센트포인트). 둘 중 하나가 비어 있으면 null. */
export function deltaPoints(now: Rate | null, before: Rate | null): number | null {
  if (!now || !before || now.rate == null || before.rate == null) return null;
  return now.rate - before.rate;
}

/** 두 비율의 차이가 우연으로 설명되는 정도인지 (두 표본 비율 z 검정, |z|<1.96 이면 '뚜렷한 변화 아님') */
export function significantChange(now: Rate | null, before: Rate | null): boolean {
  if (!now || !before || now.total < 30 || before.total < 30) return false;
  const p1 = now.pos / now.total, p2 = before.pos / before.total;
  const p = (now.pos + before.pos) / (now.total + before.total);
  const se = Math.sqrt(p * (1 - p) * (1 / now.total + 1 / before.total));
  return se > 0 && Math.abs(p1 - p2) / se >= 1.96;
}
