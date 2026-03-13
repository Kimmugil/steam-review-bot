import streamlit as st

APP_VERSION = "v2.1.6"
UPDATE_HISTORY = """
**[v2.1.6] - 2026.03.13**
- 📝 **워딩 변경:** '국가별 세부 평가' -> '리뷰 작성 언어별 세부 평가'로 명칭 정확화
- 🐛 **버그 픽스:** 언어 비중 순위표(TOP 3)와 실제 분석되는 리뷰 언어가 불일치하던 현상 완벽 수정
- 🌐 **번역 강화:** AI가 외국어 리뷰 인용 시 한국어 번역을 누락하지 않도록 프롬프트 통제 강화

**[v2.1.5] - 2026.03.13**
- 🔗 **URL 파싱:** 스팀 상점 전체 주소를 붙여넣어도 App ID를 자동 추출
- 👁️ **웹 프리뷰 도입:** 노션 업로드 전 AI 분석 결과를 웹에서 확인 및 승인
- 🚫 **제로 리뷰 방어:** 리뷰가 0개인 게임(베타 등) 차단 로직 추가
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
    "country_analysis"   # 언어별 세부 평가 분석
]

# 💡 AI 분석 대기 중 표시될 랜덤 메시지
WAITING_MESSAGES = [
    "AI가 유저들의 매콤한 리뷰를 읽으며 눈물을 닦고 있습니다...",
    "글로벌 민심을 탈탈 털어 황금 인사이트를 고르고 있어요.",
    "뉴비와 고인물의 싸움을 AI가 말리고 있는 중입니다. 잠시만요!",
    "스팀 서버에서 리뷰를 300km/h 속도로 탈곡하고 있습니다.",
    "AI PM이 커피 한 잔 마시며 보고서를 결재하고 있습니다.",
    "언어별 번역기를 돌리며 핵심 불만 사항을 정리하고 있어요.",
    "거의 다 됐습니다! 웹에서 먼저 보여드릴게요.",
    "분석이 조금 길어지는 건 그만큼 이 게임 여론이 복잡하다는 뜻입니다!",
    "전 세계 언어를 분석하느라 AI 뇌가 풀가동 중입니다. 삐-빅."
]

# 💡 전광판 메시지 전환 간격 (초 단위)
TICKER_INTERVAL = 3
