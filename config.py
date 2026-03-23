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

# ── 9대 권역 분류 (기존 5대 권역에서 세분화) ─────────────────────────────
# 변경 이유:
#   - 기존 "영미/유럽권"에 17개 언어가 뭉쳐 있어 대표성 부족
#   - 영어는 전 세계 공용어로 비중이 압도적 → 독립 취급
#   - 동아시아(한·중·일)와 동남아시아는 게임 소비 패턴이 다름 → 분리
#   - 서유럽/동유럽/북유럽은 가격 민감도·장르 선호가 다름 → 분리
REGION_MAP = {
    # 🌏 동아시아 — 한·중·일 + 대만 (유사한 게임 문화권)
    "koreana":   "🌏 동아시아",
    "schinese":  "🌏 동아시아",
    "tchinese":  "🌏 동아시아",
    "japanese":  "🌏 동아시아",

    # 🌴 동남아시아 — 모바일 친화·가격 민감
    "thai":       "🌴 동남아시아",
    "vietnamese": "🌴 동남아시아",
    "indonesian": "🌴 동남아시아",

    # 🌐 영미권 — 영어는 전 세계 공용어로 단독 집계
    "english": "🌐 영미권",

    # 🏰 서유럽 — 서유럽 주요 언어권
    "french":     "🏰 서유럽",
    "german":     "🏰 서유럽",
    "italian":    "🏰 서유럽",
    "spanish":    "🏰 서유럽",
    "portuguese": "🏰 서유럽",
    "dutch":      "🏰 서유럽",

    # 🏔 동유럽 — 서유럽과 소비 패턴이 다름
    "polish":     "🏔 동유럽",
    "czech":      "🏔 동유럽",
    "hungarian":  "🏔 동유럽",
    "romanian":   "🏔 동유럽",
    "bulgarian":  "🏔 동유럽",
    "greek":      "🏔 동유럽",

    # 🌨 북유럽 — 인디·PC 게임 선호, 구매력 높음
    "swedish":   "🌨 북유럽",
    "danish":    "🌨 북유럽",
    "norwegian": "🌨 북유럽",
    "finnish":   "🌨 북유럽",

    # 🧊 CIS(러시아권) — 현행 유지
    "russian":    "🧊 CIS(러시아권)",
    "ukrainian":  "🧊 CIS(러시아권)",

    # 💃 중남미 — 현행 유지
    "latam":      "💃 중남미",
    "brazilian":  "💃 중남미",

    # 🕌 중동·기타 — 현행 유지
    "turkish": "🕌 중동·기타",
    "arabic":  "🕌 중동·기타",
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
