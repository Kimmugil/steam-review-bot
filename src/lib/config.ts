export const APP_VERSION = process.env.APP_VERSION ?? "v3.0.0";

export const LANG_MAP: Record<string, string> = {
  english: "🇺🇸 영어",
  koreana: "🇰🇷 한국어",
  schinese: "🇨🇳 중국어(간체)",
  tchinese: "🇹🇼 중국어(번체)",
  japanese: "🇯🇵 일본어",
  french: "🇫🇷 프랑스어",
  german: "🇩🇪 독일어",
  spanish: "🇪🇸 스페인어",
  latam: "🌎 스페인어(중남미)",
  russian: "🇷🇺 러시아어",
  brazilian: "🇧🇷 포르투갈어(브라질)",
  portuguese: "🇵🇹 포르투갈어",
  italian: "🇮🇹 이탈리아어",
  polish: "🇵🇱 폴란드어",
  turkish: "🇹🇷 튀르키예어",
  thai: "🇹🇭 태국어",
  vietnamese: "🇻🇳 베트남어",
  indonesian: "🇮🇩 인도네시아어",
  ukrainian: "🇺🇦 우크라이나어",
  czech: "🇨🇿 체코어",
  hungarian: "🇭🇺 헝가리어",
  arabic: "🇸🇦 아랍어",
  romanian: "🇷🇴 루마니아어",
  dutch: "🇳🇱 네덜란드어",
  swedish: "🇸🇪 스웨덴어",
  danish: "🇩🇰 덴마크어",
  norwegian: "🇳🇴 노르웨이어",
  finnish: "🇫🇮 핀란드어",
  bulgarian: "🇧🇬 불가리아어",
  greek: "🇬🇷 그리스어",
};

export const REGION_MAP: Record<string, string> = {
  koreana: "🌏 동아시아",
  schinese: "🌏 동아시아",
  tchinese: "🌏 동아시아",
  japanese: "🌏 동아시아",
  thai: "🌴 동남아시아",
  vietnamese: "🌴 동남아시아",
  indonesian: "🌴 동남아시아",
  english: "🌐 영미권",
  french: "🏰 서유럽",
  german: "🏰 서유럽",
  italian: "🏰 서유럽",
  spanish: "🏰 서유럽",
  portuguese: "🏰 서유럽",
  dutch: "🏰 서유럽",
  polish: "🏔 동유럽",
  czech: "🏔 동유럽",
  hungarian: "🏔 동유럽",
  romanian: "🏔 동유럽",
  bulgarian: "🏔 동유럽",
  greek: "🏔 동유럽",
  swedish: "🌨 북유럽",
  danish: "🌨 북유럽",
  norwegian: "🌨 북유럽",
  finnish: "🌨 북유럽",
  russian: "🧊 CIS(러시아권)",
  ukrainian: "🧊 CIS(러시아권)",
  latam: "💃 중남미",
  brazilian: "💃 중남미",
  turkish: "🕌 중동·기타",
  arabic: "🕌 중동·기타",
};

export const SCORE_MAP: Record<number, string> = {
  1: "압도적으로 부정적",
  2: "매우 부정적",
  3: "대체로 부정적",
  4: "복합적",
  5: "대체로 긍정적",
  6: "매우 긍정적",
  7: "압도적으로 긍정적",
  8: "평가 없음",
  9: "평가 없음",
};

export const EVAL_LABELS = {
  none: "평가 없음",
  op: "압도적으로 긍정적",
  vp: "매우 긍정적",
  mp: "대체로 긍정적",
  mixed: "복합적",
  mn: "대체로 부정적",
  vn: "매우 부정적",
  on: "압도적으로 부정적",
};

export function getLangName(code: string): string {
  return LANG_MAP[code] ?? `🏳️ ${code}`;
}

export function calculateCustomScore(posRatio: number, total: number): string {
  if (total === 0) return EVAL_LABELS.none;
  if (posRatio >= 0.95) return EVAL_LABELS.op;
  if (posRatio >= 0.80) return EVAL_LABELS.vp;
  if (posRatio >= 0.70) return EVAL_LABELS.mp;
  if (posRatio >= 0.40) return EVAL_LABELS.mixed;
  if (posRatio >= 0.20) return EVAL_LABELS.mn;
  if (posRatio >= 0.01) return EVAL_LABELS.vn;
  return EVAL_LABELS.on;
}

export function getSentimentColor(evalStr: string): "positive" | "negative" | "mixed" | "neutral" {
  if (evalStr.includes("긍정")) return "positive";
  if (evalStr.includes("부정")) return "negative";
  if (evalStr === "복합적") return "mixed";
  return "neutral";
}
