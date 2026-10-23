/** 스팀이 인식하는 리뷰 언어 코드 30개 (표시 이름은 한국어). 이 값은 '언어'이지 '국가'가 아닙니다. */
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

/** 언어를 묶은 '언어권'. 같은 언어를 쓰는 사람이 여러 나라에 흩어져 있으므로 국가가 아니라 언어 기준 묶음입니다. */
export const GROUP_MAP: Record<string, string> = {
  koreana: "🌏 동아시아 언어권", schinese: "🌏 동아시아 언어권", tchinese: "🌏 동아시아 언어권", japanese: "🌏 동아시아 언어권",
  thai: "🌴 동남아시아 언어권", vietnamese: "🌴 동남아시아 언어권", indonesian: "🌴 동남아시아 언어권",
  english: "🌐 영어권",
  french: "🏰 서유럽 언어권", german: "🏰 서유럽 언어권", italian: "🏰 서유럽 언어권", spanish: "🏰 서유럽 언어권",
  portuguese: "🏰 서유럽 언어권", dutch: "🏰 서유럽 언어권",
  polish: "🏔 동유럽 언어권", czech: "🏔 동유럽 언어권", hungarian: "🏔 동유럽 언어권", romanian: "🏔 동유럽 언어권",
  bulgarian: "🏔 동유럽 언어권", greek: "🏔 동유럽 언어권",
  swedish: "🌨 북유럽 언어권", danish: "🌨 북유럽 언어권", norwegian: "🌨 북유럽 언어권", finnish: "🌨 북유럽 언어권",
  russian: "🧊 러시아어·우크라이나어권", ukrainian: "🧊 러시아어·우크라이나어권",
  latam: "💃 중남미 언어권", brazilian: "💃 중남미 언어권",
  turkish: "🕌 튀르키예어·아랍어권", arabic: "🕌 튀르키예어·아랍어권",
};

export function langName(code: string): string {
  return LANG_MAP[code] ?? `🏳️ ${code}`;
}

/** 플레이타임 구간 — 게임마다 달라지는 '상대 순위'가 아니라, 모든 게임에 같은 절대 시간 기준.
 *  구간은 (하한, 상한] 입니다. 기준은 '리뷰를 쓴 시점의 플레이타임'. */
export const SEGMENTS = [
  { key: "intro", label: "입문", range: "2시간 이하", min: null, max: 2 },
  { key: "early", label: "초반", range: "2~10시간", min: 2, max: 10 },
  { key: "mid", label: "중반", range: "10~50시간", min: 10, max: 50 },
  { key: "core", label: "코어", range: "50시간 초과", min: 50, max: null },
] as const;
export type SegmentKey = (typeof SEGMENTS)[number]["key"];

/** 분석 방법 버전. 1 = 예전(구글 시트) 방식, 2 = 이번 개편. */
export const METHOD_VERSION = 2;

/** AI에 보낼 리뷰 표본의 목표 크기와 구성 */
export const SAMPLE = {
  target: 450,          // 전체 목표 건수
  minPerLanguage: 10,
  maxPerLanguage: 70,
  maxLanguages: 12,     // 표본을 뽑을 언어 수 (비중 큰 순, 한국어는 항상 포함)
  slices: 5,            // 분석 기간을 시간 순으로 5등분해서 고르게 뽑음 (최근 하루에 쏠리지 않게)
  maxChars: 500,        // AI에게 보내는 리뷰 1건 최대 글자 수
  storeChars: 2000,     // DB에 저장하는 최대 글자 수
} as const;
