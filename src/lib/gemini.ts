import type { AiInsights, StoreStats } from "./types";
import { getLangName } from "./config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const AI_PROMPT_TEMPLATE = `
    넌 글로벌 게임 사업 PM이야. '{game_name}'의 스팀 유저 평가 데이터야.{feedback_instruction}

    🎯 [최우선 절대 강령 - 위반 시 해고]:
    - 분석 요약이나 내용 어디에서도 '스팀 공식 평가'의 '리뷰 개수'나 '0개', '데이터 부족', '오류' 등의 단어를 절대 언급하지 마.
    - 공식 평가는 오직 '상태(예: 복합적, 긍정적 등)'만 참고해서 전체 민심과 비교하는 용도로만 써.
    - 만약 '0개' 혹은 '데이터 수집 오류' 같은 말을 한 자라도 섞으면 분석 전체가 무효화됨을 명심해.

    🎯 [필수 선행 지시사항]:
    분석을 시작하기 전, 반드시 해당 게임에 대한 배경지식을 인지하고, 이를 바탕으로 리뷰의 맥락을 깊게 해석해.
    주의: 검색된 정보 중 유저의 사견은 배제하고 객관적 팩트 위주로 참고할 것.

    [엄격한 작성 규칙 - 위반 시 시스템 오류 발생]:
    1. 마크다운 코드 블록 기호(백틱 3개 등) 절대 금지. 오직 순수한 JSON 문자열만 출력할 것.
    2. 모든 Key와 Value는 쌍따옴표(")로 묶어야 함.
    3. 배열(List) 요소 사이, 객체(Object) 요소 사이에는 반드시 쉼표(,)를 넣을 것. 마지막 요소 뒤에는 쉼표 금지.
    4. 리뷰 인용(quote) 시, 텍스트 내의 줄바꿈은 반드시 \\n 으로 처리하고, 쌍따옴표는 \\" 로 이스케이프 처리할 것.
    5. 한국어가 아닌 모든 외국어 리뷰 인용 시, [원문]을 그대로 적고, 그 아래에 [한국어 번역]을 100% 누락 없이 추가할 것. 영어도 예외 없이 반드시 한국어 번역을 추가할 것. (한국어 리뷰면 이 줄만 생략)
    6. global_category_summary 작성 시, [긍정] 항목을 모두 먼저 쓰고 그 뒤에 [부정] 항목 나열.
    7. final_summary_all, final_summary_recent, country_analysis의 summary, 그리고 playtime_analysis의 newbie_summary와 core_summary 항목 맨 앞에 반드시 '[긍정]' 또는 '[부정]' 머리말을 붙일 것. 긍정 항목을 배열 앞쪽에 먼저 나열할 것.
    8. ai_issue_pick 작성 시 단순 현상 나열이 아니라 그로 인한 인사이트(시사점)를 반드시 포함할 것.
    9. news_summary는 공지/업데이트의 핵심을 3~4개의 배열 형태로 요약할 것.
    10. 💡 playtime_analysis: 수집된 리뷰 표본을 플레이타임 기준 하위 25%(뉴비 여론)와 상위 25%(코어 여론)로 양극화하여 분석합니다. 두 그룹 간의 공통/상반된 평가를 comparison_insights에 교차 비교할 것.
    11. [⚠️중요] 숫자 및 시간 단위(week, month, year, anniversary 등) 번역 시 절대 넘겨짚지 말고 원문 그대로 직역할 것.
    12. 텍스트 데이터 내부에 마크다운 볼드체(**) 기호를 절대 포함하지 말 것.
    13. 권역별 주요 키워드: 외국어 명사나 단어가 등장할 경우 반드시 "원문 (한국어 번역)" 형태로 작성.
    14-1. [⚠️ 절대 규칙] region_analysis의 "region" 필드에는 반드시 아래 9개 권역명 중 하나만 사용할 것. 절대로 국가명(한국, 미국, 러시아 등)을 쓰지 말 것:
        - 🌏 동아시아 (한국어, 중국어(간체), 중국어(번체), 일본어)
        - 🌴 동남아시아 (태국어, 베트남어, 인도네시아어)
        - 🌐 영미권 (영어)
        - 🏰 서유럽 (프랑스어, 독일어, 이탈리아어, 스페인어, 포르투갈어, 네덜란드어)
        - 🏔 동유럽 (폴란드어, 체코어, 헝가리어, 루마니아어, 불가리아어, 그리스어)
        - 🌨 북유럽 (스웨덴어, 덴마크어, 노르웨이어, 핀란드어)
        - 🧊 CIS(러시아권) (러시아어, 우크라이나어)
        - 💃 중남미 (스페인어(중남미), 포르투갈어(브라질))
        - 🕌 중동·기타 (튀르키예어, 아랍어)
    14-2. 국가별 유저 리뷰 원문 인용 (\`country_analysis\` 영역):
        - '권역(아시아 등)'이 아닌 실제 유저가 작성한 언어 기반의 '국가명(예: 러시아, 미국, 중국, 한국)'으로 명시.
        - 요약(summary)은 1~2문장으로 명확히 요약하며, 빈 배열([]) 절대 금지!!
        - quote(원문 인용)는 반드시 위 [리뷰 데이터]에서 제공된 실제 리뷰 원문 중, 해당 카테고리 요약과 가장 관련성이 높은 리뷰를 그대로 복사하여 사용할 것.
        - quote를 절대 임의로 창작하거나 내용을 수정하지 말 것. 반드시 [👍 또는 👎 | 🌐 언어명 | ⏱️ Xh] 태그가 포함된 원문을 그대로 발췌할 것.
    {country_order_instruction}

    [⚠️ 리뷰 데이터 역할별 사용 규칙]:
    아래 [리뷰 데이터]는 분석 목적에 따라 섹션이 구분되어 있음. 각 JSON 항목 작성 시 반드시 지정된 섹션의 리뷰만 근거로 사용할 것:
    - final_summary_all / global_category_summary / playtime_analysis → [전체 여론 동향용 누적 리뷰] 사용
    - final_summary_recent → [전체 여론 동향용 최근 리뷰] 사용
    - region_analysis → [권역별 세부 평가용 누적 리뷰] 사용. 해당 섹션에 없는 권역은 "데이터 부족으로 분석 생략"으로 처리
    - ai_issue_pick → [이슈픽용 최근 리뷰] 만 사용. 최근 기간 리뷰에서만 이슈를 도출할 것
    - country_analysis → [국가별 원문 분석용 누적 리뷰] 및 [국가별 원문 분석용 최근 리뷰] 사용

    [출력 JSON 형식]:
    \`\`\`json
    {
      "critic_one_liner": "한줄평 (이모지 포함)",
      "sentiment_analysis": "민심 코멘트 (공식 평점과 전체 평점 간의 차이가 있다면 이에 대한 분석 포함)",
      "final_summary_all": ["[긍정] 코멘트1", "[부정] 코멘트2"],
      "final_summary_recent": ["[긍정] 코멘트1", "[부정] 코멘트2"],
      "ai_issue_pick": ["이슈 현상 및 인사이트 1"],
      "news_summary": ["공지 요약1"],
      "playtime_analysis": {
        "comparison_insights": ["교차 인사이트1"],
        "newbie_title": "🌱 뉴비 여론 (하위 25%)", "newbie_summary": ["[긍정] 요약1", "[부정] 요약2"],
        "normal_title": "🚶 일반 여론 (중위 50%)", "normal_summary": ["[긍정] 요약1", "[부정] 요약2"],
        "core_title": "💀 코어 여론 (상위 25%)", "core_summary": ["[긍정] 요약1", "[부정] 요약2"]
      },
      "global_category_summary": [{"category": "[긍정] 카테고리명", "summary": ["[긍정] 요약"]}],
      "region_analysis": {
        "divergence_insight": "권역별 여론이 상이할 경우 원인 분석 (비슷하면 빈 문자열)",
        "regions": [
            {
                "region": "반드시 아래 9개 권역 중 하나만 사용: 🌏 동아시아 / 🌴 동남아시아 / 🌐 영미권 / 🏰 서유럽 / 🏔 동유럽 / 🌨 북유럽 / 🧊 CIS(러시아권) / 💃 중남미 / 🕌 중동·기타",
                "trend": "대체로 긍정적 등",
                "keywords": ["Оптимизация (최적화)", "Story (스토리)"],
                "categories": [{"name": "[긍정] 카테고리명", "summary": ["[긍정] 요약"]}]
            }
        ]
      },
      "country_analysis": [
        {
            "country": "국가명 (예: 러시아, 중국, 한국)",
            "categories": [{
                "name": "[긍정] 또는 [부정] 카테고리명",
                "summary": ["[긍정] 또는 [부정]으로 시작하는 요약 (빈 배열 절대 금지)"],
                "quote": {"original": "원문 그대로 삽입 (모든 언어)", "korean": "한국어 번역 (한국어 리뷰일 때만 빈 문자열. 영어 포함 모든 외국어는 반드시 한국어 번역 작성)"}
            }]
        }
      ]
    }
    \`\`\`

    [통계 데이터]
    - 🛑 스팀 공식 평가 (상점 노출 지표): {official_rating_info}
    - 📈 전체 누적 평가 (무료/외부키 포함): {all_desc} (총 {all_total}개)
    - 🔥 {recent_label} 민심 (최근 분석 표본): {recent_desc} (분석 표본 {recent_total}개)
    - 누적 리뷰 언어 비중: {top_langs_str}
    - 📊 표본 기준 하위 25% 뉴비 평균 플레이타임: {newbie_avg}시간
    - 🚶 표본 기준 중위 50% 일반 평균 플레이타임: {norm_avg}시간
    - 💀 표본 기준 상위 25% 코어 평균 플레이타임: {core_avg}시간
    {news_text}

    [리뷰 데이터]
    {review_text}
    `;

const QA_PROMPT_TEMPLATE = `넌 글로벌 게임 사업 PM이야. 이미 작성된 분석 리포트와 데이터를 바탕으로, 팀원의 추가 질문에 빠르고 객관적으로 답변해줘.

[팀원 질문]: {question}

[참고 데이터 1 - 분석 결과]:
{insights}
{review_context}

답변 작성 규칙:
1. 분석 결과에 있으면 거기서 먼저 답변할 것.
2. 분석 결과에 없더라도 [수집된 전체 리뷰 원문]에 있으면 직접 찾아서 답변할 것. (예: 특정 주제 원문 인용 요청 등)
3. 두 곳 모두에서 확인할 수 없는 내용은 "제공된 데이터에서는 확인이 어렵습니다"라고 할 것.
4. 팩트 기반으로 3~4문장 이내로 핵심만 대답할 것. (리뷰 원문 인용 시 예외 허용)
5. 노션에 텍스트로 들어갈 예정이므로 마크다운 볼드체 등 특수기호는 가급적 사용하지 말 것.
`;

function fmtReviews(
  langDict: Record<string, string[]>,
  langSet: Set<string>,
  label: string
): string {
  const lines: string[] = [];
  for (const [lang, revs] of Object.entries(langDict)) {
    if (langSet.has(lang) && revs.length) {
      lines.push(`  [${getLangName(lang)}]`);
      lines.push(...revs.map((r) => `    ${r}`));
    }
  }
  return `--- [${label}] ---\n` + (lines.length ? lines.join("\n") : "  (없음)");
}

export async function analyzeWithGemini(
  gameName: string,
  reviewsAll: Record<string, string[]>,
  reviewsRecent: Record<string, string[]>,
  storeStats: StoreStats,
  recentLabel: string,
  newsData: { title: string | null; contents: string | null },
  feedback?: string
): Promise<{ insights: AiInsights | null; error: string | null }> {
  if (!GEMINI_API_KEY) {
    return { insights: null, error: "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. GitHub Secrets 또는 .env.local을 확인해주세요." };
  }
  const feedbackInstruction = feedback
    ? `\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n${feedback}\n`
    : "";

  const topLangs = storeStats.table_data_all.slice(0, 5).map((r) => `${r.lang}(${r.ratio})`).join(", ");
  const newsText = newsData.title ? `- 최근 공지/뉴스: ${newsData.title}` : "- 최근 공지/뉴스: 없음";

  const summaryLangs = new Set(storeStats.summary_langs);
  const regionLangs = new Set(storeStats.region_langs);
  const issueLangs = new Set(storeStats.issue_langs);
  const countryLangs = new Set(storeStats.country_langs_ordered);

  const allSummaryText = fmtReviews(reviewsAll, summaryLangs, `전체 여론 동향용 누적 리뷰 (전체 비중 약 ${storeStats.summary_coverage}% 커버)`);
  const allRegionText = fmtReviews(reviewsAll, regionLangs, "권역별 세부 평가용 누적 리뷰 (9대 권역 × 권역당 상위 3개 언어)");
  const allCountryText = fmtReviews(reviewsAll, countryLangs, "국가별 원문 분석용 누적 리뷰 (누적 TOP3 + 한국어)");
  const recSummaryText = fmtReviews(reviewsRecent, summaryLangs, `전체 여론 동향용 최근 리뷰 (전체 비중 약 ${storeStats.summary_coverage}% 커버)`);
  const recIssueText = fmtReviews(reviewsRecent, issueLangs, "이슈픽용 최근 리뷰 (최근 기간 상위 5개 언어)");
  const recCountryText = fmtReviews(reviewsRecent, countryLangs, "국가별 원문 분석용 최근 리뷰");
  const reviewText = [allSummaryText, allRegionText, allCountryText, recSummaryText, recIssueText, recCountryText].join("\n\n");

  let countryOrderInstruction = "";
  if (storeStats.country_langs_ordered.length) {
    const orderedNames = storeStats.country_langs_ordered.map((l) => getLangName(l));
    countryOrderInstruction =
      `\n    15. [⚠️ 절대 규칙] country_analysis 배열은 반드시 아래 순서대로만 작성할 것. ` +
      `이 순서는 누적 리뷰 비중 순위 기반이며 절대 변경 금지:\n` +
      orderedNames.map((name, i) => `        ${i + 1}위: ${name}`).join("\n") +
      `\n        총 ${orderedNames.length}개 국가만 작성. 이 목록에 없는 언어는 country_analysis에 포함하지 말 것.`;
  }

  const prompt = AI_PROMPT_TEMPLATE
    .replace("{game_name}", gameName)
    .replace("{feedback_instruction}", feedbackInstruction)
    .replace("{official_rating_info}", storeStats.official_desc)
    .replace("{all_desc}", storeStats.all_desc)
    .replace("{all_total}", String(storeStats.all_total))
    .replace("{recent_label}", recentLabel)
    .replace("{recent_desc}", storeStats.recent_desc)
    .replace("{recent_total}", String(storeStats.recent_total))
    .replace("{top_langs_str}", topLangs)
    .replace("{newbie_avg}", String(storeStats.newbie_avg))
    .replace("{norm_avg}", String(storeStats.norm_avg))
    .replace("{core_avg}", String(storeStats.core_avg))
    .replace("{news_text}", newsText)
    .replace("{review_text}", reviewText)
    .replace("{country_order_instruction}", countryOrderInstruction);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini 응답이 비어있습니다");
    const insights = JSON.parse(text) as AiInsights;
    return { insights, error: null };
  } catch (e) {
    return { insights: null, error: `AI 분석 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function askFollowupQuestion(
  insights: AiInsights,
  question: string,
  reviewsAll?: Record<string, string[]>,
  reviewsRecent?: Record<string, string[]>
): Promise<{ answer: string | null; error: string | null }> {
  if (!GEMINI_API_KEY) {
    return { answer: null, error: "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다." };
  }
  let reviewContext = "";
  if (reviewsAll || reviewsRecent) {
    const lines = ["[수집된 전체 리뷰 원문 — 리포트에 표시되지 않은 내용도 여기서 찾을 수 있음]"];
    if (reviewsAll) {
      lines.push("--- [누적 리뷰] ---");
      for (const [lang, revs] of Object.entries(reviewsAll)) {
        if (revs.length) {
          lines.push(`  [${getLangName(lang)}]`);
          lines.push(...revs.map((r) => `    ${r}`));
        }
      }
    }
    if (reviewsRecent) {
      lines.push("--- [최근 기간 리뷰] ---");
      for (const [lang, revs] of Object.entries(reviewsRecent)) {
        if (revs.length) {
          lines.push(`  [${getLangName(lang)}]`);
          lines.push(...revs.map((r) => `    ${r}`));
        }
      }
    }
    reviewContext = "\n" + lines.join("\n");
  }

  const prompt = QA_PROMPT_TEMPLATE
    .replace("{question}", question)
    .replace("{insights}", JSON.stringify(insights, null, 2))
    .replace("{review_context}", reviewContext);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return { answer: answer ?? null, error: null };
  } catch (e) {
    return { answer: null, error: String(e) };
  }
}
