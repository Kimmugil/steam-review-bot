# prompts.py
def build_prompt(game_name, store_stats, recent_label, top_langs_str, news_text, review_text, user_feedback=""):
    feedback_instruction = f"\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{user_feedback}\n" if user_feedback else ""
    
    return f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'의 스팀 유저 평가 데이터야.{feedback_instruction}
    
    🎯 [필수 선행 지시사항]: 
    분석을 시작하기 전, 반드시 해당 게임에 대한 배경지식을 인지하고, 이를 바탕으로 리뷰의 맥락을 깊게 해석해. 
    주의: 검색된 정보 중 유저의 사견은 배제하고 객관적 팩트 위주로 참고할 것.
    
    [엄격한 작성 규칙 - 위반 시 시스템 오류 발생]:
    1. 마크다운 기호(예: ```json 등) 절대 금지. 오직 순수한 JSON 문자열만 출력할 것.
    2. 모든 Key와 Value는 쌍따옴표(")로 묶어야 함.
    3. 배열(List) 요소 사이, 객체(Object) 요소 사이에는 반드시 쉼표(,)를 넣을 것. 마지막 요소 뒤에는 쉼표 금지.
    4. 리뷰 인용(quote) 시, 텍스트 내의 줄바꿈은 반드시 \\n 으로 처리하고, 쌍따옴표는 \\" 로 이스케이프 처리할 것.
    5. 한국어가 아닌 모든 외국어 리뷰 인용 시, [원문]을 그대로 적고, 그 아래에 [한국어 번역]을 100% 누락 없이 추가할 것. (한국어 리뷰면 이 줄 생략)
    6. global_category_summary 작성 시, [긍정평가] 항목을 모두 먼저 쓰고 그 뒤에 [부정평가] 항목 나열.
    7. final_summary_all, final_summary_recent의 각 항목 맨 앞에 반드시 '[긍정]' 또는 '[부정]' 머리말을 붙일 것. 긍정 항목을 배열 앞쪽에 먼저 나열할 것.
    8. ai_issue_pick 작성 시 단순 현상 나열이 아니라 그로 인한 인사이트(시사점)를 반드시 포함할 것.
    9. news_summary는 공지/업데이트의 핵심을 3~4개의 배열 형태로 요약할 것.
    10. playtime_analysis: 뉴비와 코어 유저의 여론을 분리하고, 두 그룹 간의 공통/상반된 평가를 comparison_insights에 교차 비교할 것.
    
    [출력 JSON 형식]:
    {{
      "critic_one_liner": "한줄평",
      "sentiment_analysis": "민심 코멘트",
      "final_summary_all": ["[긍정] 요약1", "[부정] 요약2"],
      "final_summary_recent": ["[긍정] 요약1", "[부정] 요약2"],
      "ai_issue_pick": ["이슈 현상 및 인사이트 1"],
      "news_summary": ["공지 요약1"],
      "playtime_analysis": {{
        "comparison_insights": ["교차 인사이트1"],
        "newbie_title": "🌱 뉴비 여론", "newbie_summary": ["요약1"],
        "core_title": "💀 코어 여론", "core_summary": ["요약1"]
      }},
      "global_category_summary": [{{ "category": "[긍정평가]...", "summary": ["요약"] }}],
      "country_analysis": [
        {{ 
            "language": "🇰🇷 한국어", 
            "categories": [{{ 
                "name": "...", 
                "summary": ["..."], 
                "quote": "[👍 | ⏱️ 15h | ID: **1234]\\n[원문] (해외 언어인 경우 반드시 원문 삽입)\\n[한국어 번역] (해외 언어인 경우 반드시 한국어 번역 삽입, 한국어 리뷰면 이 줄 생략)" 
            }}] 
        }}
      ]
    }}
    
    [통계 데이터]
    - 전체 누적 평가: {store_stats['all_desc']}
    - {recent_label} 민심: {store_stats['recent_desc']}
    - 누적 리뷰 언어 비중: {top_langs_str}
    {news_text}
    
    [리뷰 데이터]
    {review_text}
    """
