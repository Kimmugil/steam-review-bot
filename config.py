import streamlit as st

# 앱 버전 및 틱 간격 설정
APP_VERSION = "v2.2.1"
TICKER_INTERVAL = 2.5

# 💡 기본값 설정 (Secrets에 없으면 자동으로 LIVE 모드로 동작)
ENV_NAME = "LIVE"
NOTION_PUBLIC_URL = "https://www.notion.so/" 

try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    NOTION_TOKEN = st.secrets["NOTION_TOKEN"]
    NOTION_DATABASE_ID = st.secrets["NOTION_DATABASE_ID"]
    
    # 💡 [핵심] Secrets에 ENV_NAME이 적혀있으면 그 값을 최우선으로 가져옴
    if "ENV_NAME" in st.secrets:
        ENV_NAME = st.secrets["ENV_NAME"]
        
    if "NOTION_PUBLIC_URL" in st.secrets:
        NOTION_PUBLIC_URL = st.secrets["NOTION_PUBLIC_URL"]
        
except Exception:
    GEMINI_API_KEY = None
    NOTION_TOKEN = None
    NOTION_DATABASE_ID = None

# 언어 매핑 데이터
LANG_MAP = {
    "english": "🇺🇸 영어", "koreana": "🇰🇷 한국어", "schinese": "🇨🇳 중국어(간체)",
    "tchinese": "🇹🇼 중국어(번체)", "japanese": "🇯🇵 일본어", "french": "🇫🇷 프랑스어",
    "german": "🇩🇪 독일어", "spanish": "🇪🇸 스페인어", "russian": "🇷🇺 러시아어",
    "brazilian": "🇧🇷 포르투갈어(브라질)", "polish": "🇵🇱 폴란드어", "turkish": "🇹🇷 튀르키예어"
}

# 점수 매핑 데이터
SCORE_MAP = {
    1: "압도적으로 부정적", 2: "매우 부정적", 3: "대체로 부정적", 4: "복합적",
    5: "대체로 긍정적", 6: "매우 긍정적", 7: "압도적으로 긍정적", 8: "평가 없음", 9: "평가 없음"
}

# 노션 리포트 블록 순서
NOTION_SECTION_ORDER = [
    "bot_info", "ai_one_liner", "steam_sentiment", "global_summary",
    "playtime_analysis", "ai_issue_pick", "news_summary", "category_summary",
    "language_ratio", "country_analysis"
]
