def build_prompt(game_name, store_stats, recent_label, top_langs_str, news_text, review_text, user_feedback=""):
    feedback_instruction = f"\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{user_feedback}\n" if user_feedback else ""
    official_rating_info = f"{store_stats.get('official_desc', '평가 없음')}" 
    
    return f"""
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
    5. 한국어가 아닌 모든 외국어 리뷰 인용 시, [원문]을 그대로 적고, 그 아래에 [한국어 번역]을 100% 누락 없이 추가할 것. (한국어 리뷰면 이 줄 생략)
    6. global_category_summary 작성 시, [긍정평가] 항목을 모두 먼저 쓰고 그 뒤에 [부정평가] 항목 나열.
    7. final_summary_all, final_summary_recent, country_analysis의 summary, 그리고 playtime_analysis의 newbie_summary와 core_summary 항목 맨 앞에 반드시 '[긍정]' 또는 '[부정]' 머리말을 붙일 것. 긍정 항목을 배열 앞쪽에 먼저 나열할 것.
    8. ai_issue_pick 작성 시 단순 현상 나열이 아니라 그로 인한 인사이트(시사점)를 반드시 포함할 것.
    9. news_summary는 공지/업데이트의 핵심을 3~4개의 배열 형태로 요약할 것.
    10. 💡 playtime_analysis: 수집된 리뷰 표본을 플레이타임 기준 하위 25%(뉴비 여론)와 상위 25%(코어 여론)로 양극화하여 분석합니다. 두 그룹 간의 공통/상반된 평가를 comparison_insights에 교차 비교할 것. newbie_title과 core_title에는 반드시 통계 데이터에 제공된 그룹별 평균 플레이타임을 명시할 것.
    11. [⚠️중요] 숫자 및 시간 단위(week, month, year, anniversary 등) 번역 시 절대 넘겨짚지 말고 원문 그대로 직역할 것. '1 week'를 '1주년'으로 번역하는 식의 찐빠는 절대 금지다.
    12. 텍스트 데이터 내부에 마크다운 볼드체(**) 기호를 절대 포함하지 말 것. 노션 출력 시 문자 그대로 노출되는 오류가 있음.
    
    [출력 JSON 형식]:
    {{
      "critic_one_liner": "한줄평",
      "sentiment_analysis": "민심 코멘트 (공식 평점과 전체 평점 간의 차이가 있다면 이에 대한 분석 포함)",
      "final_summary_all": ["[긍정] 코멘트1", "[부정] 코멘트2"],
      "final_summary_recent": ["[긍정] 코멘트1", "[부정] 코멘트2"],
      "ai_issue_pick": ["이슈 현상 및 인사이트 1"],
      "news_summary": ["공지 요약1"],
      "playtime_analysis": {{
        "comparison_insights": ["교차 인사이트1"],
        "newbie_title": "🌱 뉴비 여론 (평균 O시간)", "newbie_summary": ["[긍정] 요약1", "[부정] 요약2"],
        "core_title": "💀 코어 여론 (평균 O시간)", "core_summary": ["[긍정] 요약1", "[부정] 요약2"]
      }},
      "global_category_summary": [{{ "category": "[긍정평가]...", "summary": ["요약"] }}],
      "country_analysis": [
        {{ 
            "language": "🇰🇷 한국어", 
            "categories": [{{ 
                "name": "...", 
                "summary": ["[긍정] ...", "[부정] ..."], 
                "quote": "[👍 | ⏱️ 15h | ID: 1234]\\n[원문] (해외 언어인 경우 반드시 원문 삽입)\\n[한국어 번역] (해외 언어인 경우 반드시 한국어 번역 삽입, 한국어 리뷰면 이 줄 생략)" 
            }}] 
        }}
      ]
    }}
    
    [통계 데이터]
    - 🛑 스팀 공식 평가 (상점 노출 지표): {official_rating_info}
    - 📈 전체 누적 평가 (무료/외부키 포함): {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)
    - 🔥 {recent_label} 민심 (최근 분석 표본): {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)
    - 누적 리뷰 언어 비중: {top_langs_str}
    - 📊 표본 기준 하위 25% 뉴비 평균 플레이타임: {store_stats.get('newbie_avg', 0)}시간
    - 💀 표본 기준 상위 25% 코어 평균 플레이타임: {store_stats.get('core_avg', 0)}시간
    {news_text}
    
    [리뷰 데이터]
    {review_text}
    """
