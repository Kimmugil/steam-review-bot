# ui_texts.py

TEXTS = {
    "main_title": "스팀 리뷰 탈곡기",
    "main_desc": "스팀 상점 주소나 App ID를 입력하면, 스팀 유저 리뷰를 탈탈 털어 글로벌 민심을 확인할 수 있습니다.",
    "dev_banner": "🚧 개발 환경 (DEV MODE) - 테스트 데이터를 자유롭게 활용하세요.",
    "api_error": "🚨 API 키 설정이 누락되었습니다.",
    "env_label": "### 📍 환경: `{}`",
    "recent_history_title": "### 📚 최근 분석 기록",
    "no_history": "기록된 이력이 없습니다.",
    "click_history": "👇 게임명을 클릭하면 과거 분석을 다시 볼 수 있습니다.",
    "btn_history_item": "🎮 {}",
    "version_label": "Version: {}",
    "update_history_title": "🛠️ 업데이트 이력",
    "report_link": "👉 통합 리포트 열람",


    # ----------------------------------------------------
    # Step
    # ----------------------------------------------------
    "step_1": "1️⃣ 분석 대상 입력",
    "step_2": "2️⃣ 리포트 검수",
    "step_3": "3️⃣ 발행 완료",
    "btn_analyze": "🚜 리뷰 탈곡기 가동하기",
    "btn_reset": "🔄 노션 발행 없이 다른 게임 분석하기",
    "btn_reset_after_publish": "🔄 다른 게임 분석하기", # 💡 [버그 수정] 발행 완료 후 버튼 텍스트 별도 분리!
    "btn_notion": "📤 노션 리포트 최종 발행",
    "qa_btn": "💬 질문하기",
    "qa_add_btn": "✅ 리포트에 추가",

    "step1_title": "🎮 Step 1. 분석할 게임 찾기",
    "step1_caption": "ℹ️ 스팀 상점 페이지의 주소(URL) 전체를 복사해서 붙여넣거나, 주소에 포함된 숫자(App ID)만 입력하셔도 됩니다.",
    "input_placeholder": "예: https://store.steampowered.com/app/2215430",
    "prompt_analyze_game": "#### 🌾 **{}** 리뷰를 탈곡할까요?",
    "prompt_release_date": "이 게임은 {} 스팀에 출시되었습니다.",
    "warn_invalid_id": "유효한 App ID 또는 주소를 입력해 주세요.",
    
    "status_analyzing": "[{}] 스팀 리뷰 탈곡 중... 🌾",
    "loading_1": "🔍 1/5: 게임 기본 정보 확인 중...",
    "loading_error_info": "게임 정보 불러오기 실패",
    "loading_2": "📥 2/5 & 3/5: 데이터 수집 중...",
    "loading_error_data": "데이터 없음",
    "loading_3": "🧠 4/5: AI 다차원 분석 중...",
    "loading_4": "✅ 5/5: 분석 완료!",
    "status_complete": "✅ 완료",
    "status_error": "에러",
    "qa_loading": "AI가 분석 중입니다...",
    "publish_loading": "노션으로 쏘는 중...",

    "step2_title": "리포트 검수",
    "step2_desc": "💡 노션으로 리포트 발행 전, 생성된 리포트를 검토하고 AI에게 리포트 내용에 대해 추가적으로 질문할 수 있습니다.",
    "tab_summary": "📊 주요 평가 요약",
    "tab_playtime": "⏱️ 플레이타입별 유저 평가",
    "tab_region": "🌐 리뷰 작성 언어별 평가 (권역&개별 언어)",
    "tab_qa": "🙋‍♀️ AI에게 질문하기",

    "bot_info_title": "ℹ️ 봇 안내 및 리포트 해석 기준",
    "bot_info_desc": "본 리포트는 스팀(Steam)의 유저 리뷰 원문 데이터를 수집하여 탈곡기(AI 텍스트 분석 엔진)을 통해 긍/부정 동향과 핵심 키워드를 추출한 결과물입니다.\n\n리뷰는 유저의 실제 국적이 아닌 '리뷰 작성 시 설정된 언어'를 기준으로 집계됩니다. 따라서 글로벌 공용어인 '영어' 리뷰 비중이 실제 영미권 유저 수보다 높게 나타날 수 있습니다.",
    
    "ai_one_liner_title": "🤖 AI 한줄평",
    "ai_one_liner_desc": "{} 스팀에 출시된 [{}]에 대한 AI 분석 결과입니다.",
    
    "metric_official": "🛑 스팀 공식 평점",
    "metric_all": "📈 전체 누적 평점",
    "metric_recent": "🔥 {} 평점",
    "metric_count": "총 {:,}개",
    "metric_recent_count": "분석 표본 {:,}개",
    
    "tooltip_official": "스팀 상점을 통해 직접 구매한 유저만 반영된 점수입니다.",
    "tooltip_all": "키 등록 및 무료 플레이 등 모든 유저를 포함한 포괄적 민심입니다.",
    "tooltip_playtime": "전체 리뷰를 플레이타임순으로 정렬 후, 하위 25%(뉴비), 중위 50%(일반), 상위 25%(코어)로 분할하여 여론을 비교합니다.",
    "tooltip_region": "전 세계를 5대 권역으로 맵핑하여 문화권별 여론의 차이를 분석합니다.\n\n🌏 아시아: 한국어, 중국어, 일본어, 태국어 등\n🌍 영미/유럽: 영어, 프랑스어, 독일어 등\n🧊 CIS: 러시아어 등\n💃 중남미: 스페인어(중남미), 포르투갈어(브라질)\n🕌 중동/기타: 튀르키예어, 아랍어 등",
    
    "summary_briefing": "##### 🎯 종합 여론 브리핑",
    "trend_all": "**📈 누적 여론 동향**",
    "trend_recent": "**🔥 {} 동향**",
    "date_period_info": "📅 수집 기간: {} (ℹ️ 기준: {})", # 💡 [업데이트] 수집 기간 명시 텍스트 포맷

    "playtime_title": "### ⏱️ 플레이타임별 민심 교차 분석",
    "insight_core": "**⚖️ 핵심 교차 인사이트**\n",
    "newbie_title_default": "🌱 뉴비 (하위 25%)",
    "normal_title_default": "🚶 일반 (중위 50%)",
    "core_title_default": "💀 코어 (상위 25%)",
    
    # 💡 [핵심] 평균 플탐이 명확하게 표시되도록 변경!
    "sample_opinion": "표본: {:,}개 | 평균 플탐: {}시간 | 여론: {}",

    "region_title": "### 🗺️ 권역별 세부 평가 분석",
    "divergence_insight": "권역별 주요 체크포인트\n\n{}",
    "region_expander": "📍 {} (동향: {})",
    "keyword_label": "🔑 주요 키워드: {}",
    
    "country_title": "### 🌍 리뷰 작성 언어(국가)별 분석",
    "country_analysis_desc": "누적 리뷰 작성 언어 상위(TOP) 1위~3위 국가와 '한국어' 리뷰에서 나타난 핵심 의견과 유저 원문을 모아서 보여줍니다.",
    "country_flag": "**🚩 {}**",
    "quote_original": "> **원문:** {}",
    "quote_korean": "> **번역:** {}",
    "toggle_quote": "👀 유저 리뷰 원문 보기",

    "table_global_title": "### 🌐 글로벌 언어 및 권역 통계표",
    "disclaimer_language": "💡 스팀 리뷰 특성상 유저의 실제 국적이 아닌 '리뷰 작성 언어'를 기준으로 분류됩니다. (영어 리뷰 비중이 실제보다 높게 나타날 수 있음)",
    "table_region_title": "##### 🗺️ 주요 권역별 누적 리뷰 비중",
    "table_all_title": "##### 🥇 언어별 누적 리뷰 비중 TOP 10",
    "toggle_all_table": "👀 언어별 누적 리뷰 비중 (전체 보기)",
    "table_30_title": "##### 🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10",
    "info_30_days": "ℹ️ 출시일로부터 30일 이후부터 지원하는 표입니다.",
    "toggle_30_table": "👀 최근 30일 누적 리뷰 비중 (전체보기)",

    "col_rank": "순위",
    "col_region": "권역",
    "col_lang": "언어",
    "col_count": "리뷰 수",
    "col_ratio": "비중",
    "col_pos": "👍 긍정 비율",
    "col_neg": "👎 부정 비율",
    "col_eval": "📊 평가 결과",

    "qa_title": "🙋‍♀️ AI에게 추가 질문하기",
    "qa_desc": "현재 작성된 분석 리포트를 기반으로 궁금한 점을 물어보세요. 마음에 드는 답변은 리포트에 박제할 수 있습니다!",
    "qa_input_ph": "예: 그래픽 관련 부정적인 여론이 있어?",
    "qa_my_q": "**나의 질문:** {}",
    "qa_ai_a": "**🤖 AI:** {}",

    "publish_title": "### 📝 최종 발행 및 다음 스텝",
    "publish_success": "🎉 리포트 발행 완료!",
    "publish_link": "생성된 노션 리포트 확인하기",

    "notion_metric_title": "📊 스팀 민심 온도계",
    "notion_summary_title": "🎯 전체 리뷰 요약",
    "notion_summary_all": "📈 전체 리뷰로 확인한 주요 여론",
    "notion_summary_recent": "🔥 {} 주요 여론",
    "notion_playtime_title": "⏱️ 플레이타임별 여론 교차 분석",
    "notion_region_title": "🗺️ 권역별 리뷰 분석",
    "notion_country_title": "🌍 리뷰 작성 언어(국가)별 분석",
    "notion_table_global_title": "🌐 글로벌 언어 및 권역 통계표",
    "notion_qa_title": "🙋‍♀️ 추가 문의사항 답변",
    "notion_error": "노션 발행 중 문제가 발생했습니다.",
    "notion_toggle_guide": "ℹ️ 각 평점 지표별 산출 기준 안내",
    "notion_toggle_playtime": "ℹ️ 플레이타임 산출 기준 안내",
    "notion_toggle_region": "ℹ️ 권역 맵핑 기준 안내",
    
    # 💡 [업데이트] 노션 전용 하드코딩 텍스트 분리
    "notion_insight_core": "핵심 교차 인사이트",
    "notion_quote_orig": "원문: {}",
    "notion_quote_ko": "번역: {}",
    "notion_toggle_quote": "유저 리뷰 원문 보기",

    "steam_period_early": "출시 초기",
    "steam_period_early_desc": "출시 직후 민심을 파악하기 위해 오픈 시점부터의 동향을 분석했습니다.",
    "steam_period_mid": "최근 {}일",
    "steam_period_mid_desc": "오픈 초기 노이즈를 배제하기 위해 출시일의 절반인 기간의 동향을 분석했습니다.",
    "steam_period_long": "최근 30일",
    "steam_period_long_desc": "서비스가 안정화된 상태로 장기 동향을 분석했습니다.",
    "steam_eval_none": "평가 없음",
    "steam_eval_op": "압도적으로 긍정적",
    "steam_eval_vp": "매우 긍정적",
    "steam_eval_mp": "대체로 긍정적",
    "steam_eval_mixed": "복합적",
    "steam_eval_mn": "대체로 부정적",
    "steam_eval_vn": "매우 부정적",
    "steam_eval_on": "압도적으로 부정적",
    "steam_etc": "기타",

    "ai_prompt_template": """
    당신은 글로벌 게임 퍼블리셔의 수석 데이터 분석가입니다.
    '{game_name}' 게임에 대한 글로벌 유저 리뷰 데이터와 최신 소식을 다각도로 분석하여 JSON 포맷으로 리포트를 작성하세요. 이 리포트의 최종 독자는 '한국인'입니다.
    
    [입력 데이터]
    - 누적 평점: {all_desc} (총 {all_total}개)
    - 최근 공지/뉴스: {news_data}
    - 누적 리뷰 표본: {reviews_all}

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
                "categories": [{{"name": "[긍정] 카테고리명", "summary": ["요약"]}}]
            }}
        ]
      }},
     "country_analysis": [
         {{
            "country": "국가명 (예: 러시아, 중국, 한국)",
            "categories": [
                {{ 
                    "name": "[긍정] 또는 [부정] 카테고리명", 
                    "summary": ["해당 카테고리에 대한 유저 의견을 1~2문장으로 명확히 요약하세요. 빈 배열([]) 절대 금지!!"], 
                    "quote": {{ "original": "원문", "korean": "한국어 번역" }}
                }}
            ]
         }}
      ]
    }}
    {backticks}
    """,

    "qa_prompt_template": "넌 글로벌 게임 PM이야. 리포트를 보고 팀원 질문에 대답해.\n[질문]: {question}\n[데이터]: {insights}",

    
    
    # ----------------------------------------------------
    # 로딩 팁 메시지 배열 (messages.py 대체)
    # ----------------------------------------------------
    
    "WAITING_MESSAGES": [
        "민첩한 하루 되세요", "( •̀ω•́ )✧",
        "척추수술 3000만원 척 추 피 세 요 ! ! !",
        "(๑˃ᴗ˂)ﻭ", "탈곡기가 탈탈탈 탈곡중 탈탈",
        "이거 생각보다 똑똑한 문제네요",
        "와,,, 이건 정말 ✌️핵심✌️을 찌르는 리뷰네요.",
        "이거 느낌이 뭔가 될 것 같은데요 근거는 없습니다",
        "좋습니다 제 뇌가 납득했습니다",
        "느낌이 좋지 않습니다",
        "패치노트에 뭐라고 써야 멋있을까요??? ( •̀ω•́ )✧",
        "단서를 찾고 있습니다 (ง •̀_•́)ง",
        "지금 컴퓨터와 진대중입니다",
        "어제까지는 잘 됐던 것 같은데요;;; 확인해보겠습니다.",
        "잠깐만요 트랙터가 재시작 중입니다 (๑•̀ㅂ•́)و✧",
        "지금 많은 생각이 지나가고 있습니다 (｡•̀ᴗ-)✧",
        "뭔가 큰 게 숨어 있습니다",
        "상황을 침착하게 정리하고 있습니다",
        "지금 트랙터가 깊은 생각에 잠겼습니다",
        "이건 살짝 수상한 상황입니다 ( •̀_•́ )",
        "좋습니다 이제 문제를 잡으러 가겠습니다 (ง •̀_•́)ง",
        "잠깐 스트레칭 타임입니다 (ง •̀_•́)ง",
        "척추수술 3천만원!!! 모두 척 추 피 세 요 ! ! !"
    ]
}
