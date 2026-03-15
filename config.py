import streamlit as st

APP_VERSION = "v2.1.7"
UPDATE_HISTORY = """
**[v2.1.7] - 2026.03.15**
- 🏗️ **환경 식별 기능:** 상단 배너를 통해 DEV/LIVE 환경을 시각적으로 구분
- 🛡️ **Secrets 로직 고도화:** 모든 민감 정보를 Secrets로 이전 완료 및 스트립 처리 추가
"""

# Secrets에서 안전하게 값을 가져오는 함수
def get_secret(key, default=None):
    try:
        val = st.secrets[key]
        return val.strip() if isinstance(val, str) else val
    except (KeyError, FileNotFoundError):
        return default

# 현재 환경 이름 (DEV / LIVE)
ENV_NAME = get_secret("ENV_NAME", "LOCAL")

# API 키 및 설정 로드
GEMINI_API_KEY = get_secret("GEMINI_API_KEY")
NOTION_TOKEN = get_secret("NOTION_TOKEN")
NOTION_DATABASE_ID = get_secret("NOTION_DATABASE_ID")
NOTION_PUBLIC_URL = get_secret("NOTION_PUBLIC_URL")

# 노션 발행 주소 설정
if NOTION_PUBLIC_URL:
    NOTION_PUBLISH_URL = NOTION_PUBLIC_URL
elif NOTION_DATABASE_ID:
    NOTION_PUBLISH_URL = f"https://www.notion.so/{NOTION_DATABASE_ID}"
else:
    NOTION_PUBLISH_URL = "https://www.notion.so"

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

NOTION_SECTION_ORDER = [
    "bot_info", "ai_one_liner", "steam_sentiment", "global_summary", 
    "playtime_analysis", "ai_issue_pick", "news_summary", 
    "category_summary", "language_ratio", "country_analysis"
]

WAITING_MESSAGES = [
    "AI가 유저들의 매콤한 리뷰를 읽으며 눈물을 닦고 있습니다...",
    "글로벌 민심을 탈탈 털어 황금 인사이트를 고르고 있어요.",
    "뉴비와 고인물의 싸움을 AI가 말리고 있는 중입니다. 잠시만요!",
    "스팀 서버에서 리뷰를 300km/h 속도로 탈곡하고 있습니다.",
    "AI PM이 커피 한 잔 마시며 보고서를 결재하고 있습니다.",
    "전 세계 언어를 번역하느라 AI 뇌가 풀가동 중입니다. 삐-빅."
]

TICKER_INTERVAL = 3
