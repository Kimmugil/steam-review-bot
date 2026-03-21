from config import GEMINI_API_KEY
import json
import requests

def analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data, feedback=None):
    backticks = "`" * 3
    json_format = f"{backticks}json"
    
    prompt = f"""
    당신은 글로벌 게임 퍼블리셔의 수석 데이터 분석가입니다.
    '{game_name}' 게임에 대한 글로벌 유저 리뷰 데이터와 최신 소식을 다각도로 분석하여 JSON 포맷으로 리포트를 작성하세요.
    
    [입력 데이터]
    - 누적 평점: {store_stats['all_desc']} (총 {store_stats['all_total']}개)
    - {recent_label} 평점: {store_stats['recent_desc']} (총 {store_stats['recent_total']}개)
    - 최근 공지/뉴스: {news_data[0] if news_data[0] else '없음'}
    - 누적 리뷰 표본: {json.dumps(reviews_all, ensure_ascii=False)}
    - 최근 리뷰 표본: {json.dumps(reviews_recent, ensure_ascii=False)}
    - 추가 분석 요청: {feedback if feedback else '없음'}

    [분석 및 작성 지침]
    1. 데이터 객관성: 제공된 데이터 외의 추측을 배제합니다.
    2. 플레이타임 교차 분석 (하위 25% 뉴비, 중위 50% 일반, 상위 25% 코어): 세 그룹 간의 평가 차이를 명확히 교차 분석해야 합니다.
    3. 권역별 세부 평가 분석: 아시아, 영미/유럽권, CIS, 중남미, 중동/기타 5개 권역으로 나누어 분석합니다.
       - 각 권역별로 긍정/부정 평가 및 키워드를 도출합니다.
       - 만약 2개 이상의 권역에서 주요 여론이 확연히 다를 경우(예: 아시아 부정적, 서구권 긍정적) 그 원인과 특징을 `divergence_insight`에 서술하고, 비슷할 경우 빈 문자열("")로 둡니다.

    [출력 JSON 구조 - 반드시 아래 키를 유지할 것]
    {json_format}
    {{
      "critic_one_liner": "게임에 대한 날카로운 한줄평 (이모지 포함)",
      "sentiment_analysis": "전체 및 최근 동향을 비교한 요약 브리핑 (3문장 내외)",
      "final_summary_all": ["[긍정] 또는 [부정] 으로 시작하는 누적 여론 요약 문장 3개"],
      "final_summary_recent": ["[긍정] 또는 [부정] 으로 시작하는 최근 여론 요약 문장 3개"],
      "playtime_analysis": {{
        "comparison_insights": ["뉴비, 일반, 코어 유저 간의 시각차에 대한 핵심 인사이트 2개"],
        "newbie_title": "🌱 뉴비 여론 (하위 25%)",
        "newbie_summary": ["뉴비 유저들의 주요 평가 요약 2개"],
        "normal_title": "🚶 일반 여론 (중위 50%)",
        "normal_summary": ["일반 유저들의 주요 평가 요약 2개"],
        "core_title": "💀 코어 여론 (상위 25%)",
        "core_summary": ["코어 유저들의 주요 평가 요약 2개"]
      }},
      "ai_issue_pick": ["최근 리뷰나 뉴스에서 두드러지는 특이점이나 논란거리 2~3개"],
      "news_summary": ["최신 뉴스와 패치노트 내용에 대한 유저 반응 연결 요약 2개"],
      "global_category_summary": [
         {{ "category": "[긍정] 또는 [부정] 카테고리명", "summary": ["해당 카테고리 요약 2개"] }}
      ],
      "region_analysis": {{
        "divergence_insight": "권역별 여론이 상이할 경우 그 이유와 특징 분석 (비슷하면 빈 문자열)",
        "regions": [
            {{
                "region": "권역명 (아시아, 영미/유럽권 등)",
                "trend": "대체로 긍정적 등",
                "keywords": ["키워드1", "키워드2"],
                "categories": [
                    {{ "name": "[긍정] 또는 [부정] 카테고리명", "summary": ["요약"] }}
                ]
            }}
        ]
      }},
      "country_analysis": [
         {{
            "language": "언어명 (한국어 등)",
            "categories": [
                {{ "name": "[긍정] 또는 [부정] 카테고리명", "summary": ["요약"], "quote": "실제 해당 언어의 인상 깊은 유저 리뷰 원문 인용" }}
            ]
         }}
      ]
    }}
    {backticks}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}], 
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text']
        return json.loads(raw_text), None
    except Exception as e:
        return None, f"AI 분석 실패: {str(e)}"

def ask_followup_question(game_name, store_stats, insights, question):
    from config import GEMINI_API_KEY
    import json
    import requests
    
    prompt = f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'에 대해 이미 작성된 분석 리포트와 데이터를 바탕으로, 팀원의 추가 질문에 빠르고 객관적으로 답변해줘.
    [팀원 질문]: {question}
    [참고 데이터]: {json.dumps(insights, ensure_ascii=False)}
    답변 작성 규칙: 팩트 기반으로 3~4문장 이내 핵심만 대답. 특수기호 최소화.
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        return res.json()['candidates'][0]['content']['parts'][0]['text'].strip(), None
    except Exception as e: return None, str(e)
