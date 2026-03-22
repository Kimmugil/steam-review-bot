import streamlit as st

APP_VERSION = "v2.2.5"
TICKER_INTERVAL = 2.5

ENV_NAME = "LIVE"
NOTION_PUBLIC_URL = "https://www.notion.so/" 

try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    NOTION_TOKEN = st.secrets["NOTION_TOKEN"]
    NOTION_DATABASE_ID = st.secrets["NOTION_DATABASE_ID"]
    if "ENV_NAME" in st.secrets: ENV_NAME = st.secrets["ENV_NAME"]
    if "NOTION_PUBLIC_URL" in st.secrets: NOTION_PUBLIC_URL = st.secrets["NOTION_PUBLIC_URL"]
    elif "NOTION_PUBLISH_URL" in st.secrets: NOTION_PUBLIC_URL = st.secrets["NOTION_PUBLISH_URL"]
except Exception:
    GEMINI_API_KEY, NOTION_TOKEN, NOTION_DATABASE_ID = None, None, None

LANG_MAP = {
    "english": "🇺🇸 영어", "koreana": "🇰🇷 한국어", "schinese": "🇨🇳 중국어(간체)",
    "tchinese": "🇹🇼 중국어(번체)", "japanese": "🇯🇵 일본어", "french": "🇫🇷 프랑스어",
    "german": "🇩🇪 독일어", "spanish": "🇪🇸 스페인어", "latam": "🌎 스페인어(중남미)",
    "russian": "🇷🇺 러시아어", "brazilian": "🇧🇷 포르투갈어(브라질)", "portuguese": "🇵🇹 포르투갈어",
    "italian": "🇮🇹 이탈리아어", "polish": "🇵🇱 폴란드어", "turkish": "🇹🇷 튀르키예어",
    "thai": "🇹🇭 태국어", "vietnamese": "🇻🇳 베트남어", "indonesian": "🇮🇩 인도네시아어",
    "ukrainian": "🇺🇦 우크라이나어", "czech": "🇨🇿 체코어", "hungarian": "🇭🇺 헝가리어",
    "arabic": "🇸🇦 아랍어", "romanian": "🇷🇴 루마니아어", "dutch": "🇳🇱 네덜란드어",
    "swedish": "🇸🇪 스웨덴어", "danish": "🇩🇰 덴마크어", "norwegian": "🇳🇴 노르웨이어",
    "finnish": "🇫🇮 핀란드어", "bulgarian": "🇧🇬 불가리아어", "greek": "🇬🇷 그리스어"
}

# 💡 [요청 3번] 전 세계 언어를 5대 핵심 권역으로 통합 매핑
REGION_MAP = {
    "koreana": "🌏 아시아", "schinese": "🌏 아시아", "tchinese": "🌏 아시아", 
    "japanese": "🌏 아시아", "thai": "🌏 아시아", "vietnamese": "🌏 아시아", "indonesian": "🌏 아시아",
    "english": "🌍 영미/유럽권", "french": "🌍 영미/유럽권", "german": "🌍 영미/유럽권", 
    "spanish": "🌍 영미/유럽권", "italian": "🌍 영미/유럽권", "polish": "🌍 영미/유럽권", 
    "czech": "🌍 영미/유럽권", "hungarian": "🌍 영미/유럽권", "romanian": "🌍 영미/유럽권", 
    "dutch": "🌍 영미/유럽권", "swedish": "🌍 영미/유럽권", "danish": "🌍 영미/유럽권", 
    "norwegian": "🌍 영미/유럽권", "finnish": "🌍 영미/유럽권", "bulgarian": "🌍 영미/유럽권", 
    "greek": "🌍 영미/유럽권", "portuguese": "🌍 영미/유럽권",
    "russian": "🧊 CIS (러시아 등)", "ukrainian": "🧊 CIS (러시아 등)",
    "latam": "💃 중남미", "brazilian": "💃 중남미",
    "turkish": "🕌 중동/기타", "arabic": "🕌 중동/기타"
}

SCORE_MAP = {
    1: "압도적으로 부정적", 2: "매우 부정적", 3: "대체로 부정적", 4: "복합적",
    5: "대체로 긍정적", 6: "매우 긍정적", 7: "압도적으로 긍정적", 8: "평가 없음", 9: "평가 없음"
}

NOTION_SECTION_ORDER = [
    "bot_info", "ai_one_liner", "steam_sentiment", "global_summary",
    "playtime_analysis", "ai_issue_pick", "news_summary", "category_summary",
    "language_ratio", "country_analysis"
]
