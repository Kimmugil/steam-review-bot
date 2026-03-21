from config import GEMINI_API_KEY
import json
import requests

def analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data, feedback=None):
    backticks = "`" * 3
    json_format = f"{backticks}json"
    
    prompt = f"""
    당신은 글로벌 게임 퍼블리셔의 수석 데이터 분석가입니다.
    '{game_name}' 게임에 대한 글로벌 유저 리뷰 데이터와 최신 소식을 다각도로 분석하여 JSON 포맷으로 리포트를 작성하세요. 이 리포트의 최종 독자는 '한국인'입니다.
    
    [입력 데이터]
    - 누적 평점: {store_stats['all_desc']} (총 {store_stats['all_total']}개)
    - 최근 공지/뉴스: {news_data[0] if news_data[0] else '없음'}
    - 누적 리뷰 표본: {json.dumps(reviews_all, ensure_ascii=False)}

    [분석 및 번역 지침 - 필수 준수]
    1. 모든 요약문과 분석 내용은 '한국어'로 작성해야 합니다.
    2. **권역별 주요 키워드**: 외국어 명사나 단어가 등장할 경우 반드시 "원문 (한국어 번역)" 형태로 작성하세요. (예: "Оптимизация (최적화)", "Graphics (그래픽)")
    3. **국가별 유저 리뷰 원문 인용 (`country_analysis` 영역)**:
       - '권역(아시아 등)'이 아닌 실제 유저가 작성한 언어 기반의 **'국가명(예: 러시아, 미국, 중국, 한국)'**으로 명시하세요.
       - 외국어 리뷰를 인용할 때는 `original`에 외국어 원문을 넣고, `korean`에 부드러운 한국어 번역을 반드시 추가하세요. (한국어 리뷰인 경우 `korean`은 빈 문자열 "" 처리)

    [출력 JSON 구조 - 반드시 아래 키를 유지할 것]
    {json_format}
    {{
      "critic_one_liner": "게임에 대한 날카로운 한줄평 (이모지 포함)",
      "sentiment_analysis": "전체 및 최근 동향을 비교한 요약 브리핑 (3문장 내외)",
      "final_summary_all": ["[긍정] 또는 [부정] 으로 시작하는 누적 여론 요약 문장 3개"],
      "final_summary_recent": ["[긍정] 또는 [부정] 으로 시작하는 최근 여론 요약 문장 3개"],
      "playtime_analysis": {{
        "comparison_insights": ["뉴비, 일반, 코어 유저 간의 시각차에 대한 핵심 인사이트 2개"],
        "newbie_title": "🌱 뉴비 여론 (하위 25%)", "newbie_summary": ["요약"],
        "normal_title": "🚶 일반 여론 (중위 50%)", "normal_summary": ["요약"],
        "core_title": "💀 코어 여론 (상위 25%)", "core_summary": ["요약"]
      }},
      "region_analysis": {{
        "divergence_insight": "권역별 여론이 상이할 경우 원인 분석 (비슷하면 빈 문자열)",
        "regions": [
            {{
                "region": "권역명",
                "trend": "대체로 긍정적 등",
                "keywords": ["Оптимизация (최적화)", "Story (스토리)"], 
                "categories": [{{ "name": "[긍정] 카테고리명", "summary": ["요약"] }}]
            }}
        ]
      }},
      "country_analysis": [
         {{
            "country": "국가명 (예: 러시아, 중국, 한국)",
            "categories": [
                {{ 
                    "name": "[긍정] 또는 [부정] 카테고리명", 
                    "summary": ["요약"], 
                    "quote": {{ "original": "원문", "korean": "한국어 번역" }}
                }}
            ]
         }}
      ]
    }}
    {backticks}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        return json.loads(res.json()['candidates'][0]['content']['parts'][0]['text']), None
    except Exception as e: return None, f"AI 분석 실패: {str(e)}"

def ask_followup_question(game_name, store_stats, insights, question):
    prompt = f"넌 글로벌 게임 PM이야. 리포트를 보고 팀원 질문에 대답해.\n[질문]: {question}\n[데이터]: {json.dumps(insights, ensure_ascii=False)}"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        return res.json()['candidates'][0]['content']['parts'][0]['text'].strip(), None
    except Exception as e: return None, str(e)
