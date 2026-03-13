import streamlit as st

APP_VERSION = "v2.1.5"
UPDATE_HISTORY = """
**[v2.1.5] - 2026.03.13**
- 🔗 **URL 파싱:** 스팀 상점 전체 주소를 붙여넣어도 App ID를 자동 추출하도록 개선
- 👁️ **웹 프리뷰 도입:** 노션 업로드 전 AI 분석 결과를 웹에서 먼저 확인하고 승인하는 프로세스 구축
- 🚫 **제로 리뷰 방어:** 리뷰가 0개인 게임(베타 등)은 분석 불가 안내 및 사전 차단
- 🔄 **이력 관리:** 시스템 안정성 확보 및 전광판 로직 고도화

**[v2.1.4] - 2026.03.13**
- 🔄 **전광판 롤링 구현:** AI 분석 중 메시지가 실시간으로 교체되도록 개선
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

# 노션 출력 순서 제어
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

# AI 분석 대기 중 표시될 랜덤 메시지
WAITING_MESSAGES = [
    "AI가 유저들의 매콤한 리뷰를 읽으며 눈물을 닦고 있습니다...",
    "스팀 사용자 평가를 탈탈탈 탈곡중입니다.",
    "탈곡기는 계속 돌아가고 있습니다....",
    "척 추 펴 세 요 ! ! !",
    "칭따오 한번 꼭 가보세용",
    "국가별 욕설(?)을 걸러내고 핵심 불만 사항을 정리하고 있어요.",
    "거의 다 됐습니다! 노션에 예쁘게 담는 중이에요.",
    "분석이 조금 길어지는 건 그만큼 이 게임 여론이 복잡하다는 뜻입니다!",
    "삐빅.. 삐비비빗.."
]

# 전광판 메시지 전환 간격 (초 단위)
TICKER_INTERVAL = 3
