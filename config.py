import streamlit as st

APP_VERSION = "v2.1.5"
UPDATE_HISTORY = """
**[v2.1.5] - 2026.03.13**
- 🔗 **URL 파싱:** 스팀 상점 전체 주소를 붙여넣어도 App ID를 자동 추출하도록 개선
- 👁️ **웹 프리뷰 도입:** 노션 업로드 전 AI 분석 결과를 웹에서 먼저 확인하고 승인하는 프로세스 구축
- 🚫 **제로 리뷰 방어:** 리뷰가 0개인 게임(베타 등)은 분석 불가 안내 및 사전 차단
- 🛡️ **환경 설정 강화:** Secrets 로딩 로직을 개선하여 디버깅 편의성 증대
"""

# 💡 Secrets에서 안전하게 값을 가져오는 함수
def get_secret(key, default=None):
    try:
        return st.secrets[key]
    except (KeyError, FileNotFoundError):
        return default

# API 키 및 설정 로드
GEMINI_API_KEY = get_secret("GEMINI_API_KEY")
NOTION_TOKEN = get_secret("NOTION_TOKEN")
NOTION_DATABASE_ID = get_secret("NOTION_DATABASE_ID")

# 🔗 노션 발행 주소 (ID가 없을 경우를 대비해 안전하게 처리)
if NOTION_DATABASE_ID:
    NOTION_PUBLISH_URL = f"https://childlike-binder-ad2.notion.site/{NOTION_DATABASE_ID}"
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

# 노션 출력 순서 제어
NOTION_SECTION_ORDER = [
    "bot_info", "ai_one_liner", "steam_sentiment", "global_summary", 
    "playtime_analysis", "ai_issue_pick", "news_summary", 
    "category_summary", "language_ratio", "country_analysis"
]

# AI 분석 대기 중 표시될 랜덤 메시지
WAITING_MESSAGES = [
    "AI가 유저들의 매콤한 리뷰를 읽으며 눈물을 닦고 있습니다...",
    "글로벌 민심을 탈탈 털어 황금 인사이트를 고르고 있어요.",
    "뉴비와 고인물의 싸움을 AI가 말리고 있는 중입니다. 잠시만요!",
    "스팀 서버에서 리뷰를 300km/h 속도로 탈곡하고 있습니다.",
    "AI PM이 커피 한 잔 마시며 보고서를 결재하고 있습니다.",
    "국가별 욕설(?)을 걸러내고 핵심 불만 사항을 정리하고 있어요.",
    "거의 다 됐습니다! 웹에서 먼저 보여드릴게요.",
    "분석이 조금 길어지는 건 그만큼 이 게임 여론이 복잡하다는 뜻입니다!",
    "전 세계 언어를 번역하느라 AI 뇌가 풀가동 중입니다. 삐-빅."
]

# 전광판 메시지 전환 간격 (초 단위)
TICKER_INTERVAL = 3
