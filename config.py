import streamlit as st

APP_VERSION = "v2.1.2"
UPDATE_HISTORY = """
**[v2.1.2] - 2026.03.13**
- ✨ 분석 고도화, 모듈화 진행 및 노션 목차/순서 제어 기능 추가 등
"""

# API 키 설정 (Streamlit Secrets)
try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    NOTION_TOKEN = st.secrets["NOTION_TOKEN"]
except KeyError:
    GEMINI_API_KEY = None
    NOTION_TOKEN = None

NOTION_DATABASE_ID = "321fa327f28680dc8df5fe92fab193bf"
NOTION_PUBLISH_URL = f"https://childlike-binder-ad2.notion.site/{NOTION_DATABASE_ID}"

LANG_MAP = {
    "koreana": "🇰🇷 한국어", "english": "🇺🇸 영어", "schinese": "🇨🇳 중국어(간체)", 
    "tchinese": "🇹🇼 중국어(번체)", "japanese": "🇯🇵 일본어", "russian": "🇷🇺 러시아어", 
    "spanish": "🇪🇸 스페인어", "german": "🇩🇪 독일어", "french": "🇫🇷 프랑스어", 
    "portuguese": "🇵🇹 포르투갈어", "brazilian": "🇧🇷 포르투갈어(브라질)", "polish": "🇵🇱 폴란드어"
}

SCORE_MAP = {
    1: "압도적으로 부정적", 2: "매우 부정적", 3: "부정적", 4: "대체로 부정적",
    5: "복합적", 6: "대체로 긍정적", 7: "긍정적", 8: "매우 긍정적", 9: "압도적으로 긍정적"
}

# 💡 노션 출력 순서 제어
NOTION_SECTION_ORDER = [
    "bot_info",          # 봇 안내
    "ai_one_liner",      # AI 한줄평
    "steam_sentiment",   # 스팀 민심 온도계
    "global_summary",    # 전 국가 망라 최종 요약
    "playtime_analysis", # 플레이타임별 주요 민심 교차 분석
    "ai_issue_pick",     # AI 이슈 픽
    "news_summary",      # 최신 게임 공지/패치노트
    "category_summary",  # 카테고리별 종합 평가
    "language_ratio",    # 누적 리뷰 작성 언어 비중
    "country_analysis"   # 국가별 세부 평가 분석
]
