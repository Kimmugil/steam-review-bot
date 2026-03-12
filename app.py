import streamlit as st
import json
import requests
import urllib.parse
import time
from datetime import datetime

# ==========================================
# 🚀 0. 앱 메타데이터 및 버전 정보
# ==========================================
APP_VERSION = "v2.0.2"
UPDATE_HISTORY = """
**[v2.0.2] - 2026.03.12**
- 🛡️ **신뢰도 패치 및 최적화:** AI 배경정보 학습 프롬프트 워딩 정제 (신뢰도 향상) 및 내부 코드 로직 최적화

**[v2.0.1] - 2026.03.12**
- 🛡️ **AI 팩트체크 강화:** 배경정보 학습 시 유저 사견/루머 배제 지시 추가
- 🚧 **예외 처리:** 게임 배경지식 데이터가 없을 경우 무리한 추론 방지 및 스팀 데이터 집중 지시

**[v2.0.0] - 2026.03.12**
- 🧠 **AI 배경정보 선행 학습:** 분석 전 게임의 배경정보를 자체 학습하도록 프롬프트 업데이트
- 📰 **최신 업데이트 뉴스 연동:** 스팀 최신 패치노트/공지를 불러와 AI가 요약 및 노션 임베드
- ⏳ **스마트 분석 기간 도입:** 게임 출시일 기준으로 최근 동향 기간(3일/7일/30일) 자동 조절
- 💡 **UI/UX 개선:** App ID 입력 가이드 추가, 피드백 시 기존 리포트 삭제 안내 추가

**[v1.0.0] - 2026.03.08**
- 🚜 스팀 사용자 평가 탈곡기 최초 배포
"""

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="centered")

# ==========================================
# 🔑 1. API 키 및 토큰 설정
# ==========================================
try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    NOTION_TOKEN = st.secrets["NOTION_TOKEN"]
except KeyError:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았습니다! 배포 설정(Advanced settings)을 확인해주세요.")
    st.stop()

NOTION_DATABASE_ID = "321fa327f28680dc8df5fe92fab193bf"

# ==========================================
# 🌐 2. 글로벌 설정 사전
# ==========================================
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

def get_lang_name(lang_code):
    return LANG_MAP.get(lang_code, f"🏳️ {lang_code}")

def calculate_custom_score(pos_ratio, total):
    if total == 0: return "평가 없음"
    if pos_ratio >= 0.95: return "압도적으로 긍정적"
    elif pos_ratio >= 0.80: return "매우 긍정적"
    elif pos_ratio >= 0.70: return "대체로 긍정적"
    elif pos_ratio >= 0.40: return "복합적"
    elif pos_ratio >= 0.20: return "대체로 부정적"
    elif pos_ratio >= 0.01: return "매우 부정적"
    return "압도적으로 부정적"

# ==========================================
# 🎮 3. 스팀 데이터 수집 엔진
# ==========================================
def get_steam_game_info(game_input):
    """게임 이름이나 App ID로 기본 정보와 출시일을 가져옵니다."""
    app_id = game_input if game_input.isdigit() else None
    
    if not app_id:
        res = requests.get(f"https://store.steampowered.com/api/storesearch/?term={game_input}&l=korean&cc=KR").json()
        if not res.get('items'): return None, None, None
        app_id = str(res['items'][0]['id'])
    
    details_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean"
    res = requests.get(details_url).json()
    
    if not res or str(app_id) not in res or not res[str(app_id)]['success']: 
        return None, None, None
        
    game_data = res[str(app_id)]['data']
    exact_name = game_data['name'].encode('utf-8', 'ignore').decode('utf-8')
    
    try: 
        raw_date = game_data['release_date']['date']
        clean_date = raw_date.replace("년 ", "-").replace("월 ", "-").replace("일", "")
        release_date = datetime.strptime(clean_date, "%Y-%m-%d")
    except: 
        release_date = datetime(2020, 1, 1) # 파싱 실패 시 기본값
        
    return app_id, exact_name, release_date

def fetch_latest_news(app_id):
    """최신 패치노트나 공지사항을 가져옵니다."""
    url = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=3&maxlength=2000&format=json"
    try:
        news_items = requests.get(url).json().get('appnews', {}).get('newsitems', [])
        for item in news_items:
            title_lower = item.get('title', '').lower()
            if item.get('feed_type') == 1 or 'update' in title_lower or 'patch' in title_lower:
                return item['title'], item['contents'], item['url']
        if news_items:
            return news_items[0]['title'], news_items[0]['contents'], news_items[0]['url']
    except: pass
    return None, None, None

def get_smart_period(release_date):
    """출시일 기반으로 분석 기간을 스마트하게 설정합니다."""
    days_since = (datetime.now() - release_date).days
    if days_since < 3:
        return None, "전체 주요 동향", "출시 3일 미만으로 데이터가 적어 '전체 동향 대비 주요 동향' 위주로 분석했습니다."
    elif days_since < 7:
        return 3, "최근 3일 동향", "출시 7일 미만인 초기 게임이므로 '최근 3일 내 동향'을 기준으로 민심을 분석했습니다."
    elif days_since < 30:
        return 7, "최근 7일 동향", "출시 30일 미만의 신작이므로 '최근 7일 내 동향'을 기준으로 민심을 분석했습니다."
    return 30, "최근 30일 동향", "출시 30일 이상 경과하여 '최근 30일 내 동향'을 기준으로 민심을 분석했습니다."

def fetch_review_list(app_id, day_range=None):
    """스팀 API를 순회하며 리뷰 리스트를 추출합니다."""
    reviews, pos_count = [], 0
    base_url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=all&language=all&num_per_page=100&purchase_type=all"
    if day_range: base_url += f"&day_range={day_range}"
        
    cursor = "*"
    for _ in range(5): 
        res = requests.get(base_url + f"&cursor={urllib.parse.quote(cursor)}").json()
        if not res.get('reviews'): break
        for r in res['reviews']:
            reviews.append({
                "language": r['language'], 
                "is_positive": r['voted_up'],
                "playtime": round(r['author'].get('playtime_at_review', 0) / 60, 1),
                "steam_id": str(r['author'].get('steamid', '익명'))[-4:],
                "review": r['review'][:400].replace('\n', ' ').encode('utf-8', 'ignore').decode('utf-8')
            })
            if r['voted_up']: pos_count += 1
        cursor = res.get('cursor', '*')
        if not cursor: break
    return reviews, pos_count

def fetch_steam_reviews(app_id, recent_days_val):
    """전체 리뷰와 최근 리뷰 데이터를 획득하고 정제합니다."""
    total_lang_counts = {}
    all_time_total_reviews = 0
    
    for lang in LANG_MAP.keys():
        try:
            res = requests.get(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all").json()
            count = res.get('query_summary', {}).get('total_reviews', 0)
            if count > 0:
                total_lang_counts[lang] = count
                all_time_total_reviews += count
        except: pass
            
    summary_all = requests.get(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=all").json().get('query_summary', {})
    
    reviews_all, _ = fetch_review_list(app_id, day_range=None)
    reviews_recent, pos_recent = fetch_review_list(app_id, day_range=recent_days_val) if recent_days_val else (reviews_all, sum(1 for r in reviews_all if r['is_positive']))
    
    recent_total = len(reviews_recent)
    recent_custom_desc = calculate_custom_score(pos_recent / recent_total if recent_total > 0 else 0, recent_total)
    
    store_stats = {
        "all_desc": SCORE_MAP.get(summary_all.get('review_score', 0), "평가 없음"),
        "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc,
        "recent_total": recent_total, 
        "total_lang_counts": total_lang_counts 
    }
        
    lang_counts_combined = {}
    for r in reviews_all + reviews_recent:
        lang_counts_combined[r['language']] = lang_counts_combined.get(r['language'], 0) + 1
        
    top_langs_keys = [l[0] for l in sorted(lang_counts_combined.items(), key=lambda x: x[1], reverse=True)[:3]]
    if "koreana" not in top_langs_keys and "koreana" in lang_counts_combined:
        top_langs_keys.append("koreana")
    
    def filter_reviews(review_list):
        filtered = {lang: [] for lang in top_langs_keys}
        for r in review_list:
            if r['language'] in top_langs_keys and len(filtered[r['language']]) < 20:
                filtered[r['language']].append(f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: **{r['steam_id']}] {r['review']}")
        return filtered

    return filter_reviews(reviews_all), filter_reviews(reviews_recent), store_stats

# ==========================================
# 🧠 4. AI 리뷰 분석 (Gemini API)
# ==========================================
def analyze_with_gemini(game_name, review_data_all, review_data_recent, store_stats, recent_label, news_data, user_feedback=""):
    top_langs_str = ", ".join([f"{get_lang_name(k)}: {v:,}개" for k, v in sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:7]])
    
    review_text = "==== [전체 누적 평가 주요 리뷰] ====\n"
    for lang, revs in review_data_all.items():
        if revs: review_text += f"\n🌍 [{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    review_text += f"\n\n==== [{recent_label} 주요 리뷰] ====\n"
    for lang, revs in review_data_recent.items():
        if revs: review_text += f"\n🌍 [{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    news_title, news_contents, _ = news_data
    news_text = f"\n[최신 게임 업데이트/공지]\n- 제목: {news_title}\n- 내용: {news_contents[:1000]}" if news_title else ""
    feedback_instruction = f"\n\n🚨 [사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{user_feedback}\n" if user_feedback else ""
        
    prompt = f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'의 스팀 유저 평가 데이터야.{feedback_instruction}
    
    🎯 [필수 선행 지시사항]: 
    분석을 시작하기 전, 반드시 해당 게임에 대한 포괄적인 배경지식, 세계관, 개발사, 핵심 특징 등을 너의 사전 학습된 데이터에서 스스로 검색하여 인지하고, 이를 바탕으로 리뷰의 맥락(왜 이런 불만/호평이 나오는지)을 더 깊게 해석해. 
    🚨 [주의]: 검색된 정보 중 유저의 주관적인 사견이나 검증되지 않은 루머는 철저히 배제하고 오직 '객관적 팩트' 위주로만 참고할 것. 만약 해당 게임에 대한 정보가 충분하지 않다면 무리해서 추측하지 말고, 즉시 제공된 스팀 데이터 분석에만 집중해.
    
    [통계 데이터]
    - 전체 누적 평가: {store_stats['all_desc']}
    - {recent_label} 민심: {store_stats['recent_desc']}
    - 누적 리뷰 언어 비중: {top_langs_str}
    {news_text}
    
    ⚠️ 작성 규칙:
    1. 마크다운 기호(**, # 등) 금지. 요약은 간결하게 작성.
    2. global_category_summary 작성 시, [긍정평가] 항목을 모두 먼저 쓰고 그 뒤에 [부정평가] 항목 나열.
    3. 한국어가 아닌 타 언어 리뷰 인용 시, [원문]과 [한국어 번역] 필수 기재.
    
    {{
      "critic_one_liner": "게임 여론과 핵심 맹점을 짚어주는 담백하고 위트있는 한줄평 (1문장)",
      "sentiment_analysis": "전체 누적 평가와 {recent_label} 민심을 비교 분석하는 코멘트 (1~2줄)",
      "language_analysis": "주요 흥행 국가 및 특징, 영어 비중이 높은 이유 등 분석 (1~2줄)",
      "final_summary_all": ["전체 올타임 여론 요약 1", "요약 2"],
      "final_summary_recent": ["{recent_label} 기준 최근 주요 여론 요약 1", "요약 2"],
      "ai_issue_pick": ["AI 발견 최근 특이 동향 1"],
      "news_summary": "제공된 [최신 게임 업데이트/공지] 내용의 핵심 요약 및 이것이 유저 여론에 미칠 영향 분석 (최대 2줄. 만약 제공된 뉴스가 없다면 '최근 업데이트 내역을 찾을 수 없습니다.' 라고 작성)",
      "global_category_summary": [
        {{ "category": "[긍정평가] 콘텐츠 관련 평가", "summary": ["요약 1", "요약 2"] }},
        {{ "category": "[부정평가] 최적화 관련 평가", "summary": ["요약 1", "요약 2"] }}
      ],
      "country_analysis": [
        {{
          "language": "🇰🇷 한국어 등 (국기 포함)",
          "categories": [
            {{ "name": "[긍정평가] 콘텐츠 관련 평가", "summary": ["요약 1"], "quote": "[👍 | ⏱️ 15h | ID: **1234]\\n[원문] (타언어)\\n[한국어 번역]" }}
          ]
        }}
      ]
    }}
    
    [리뷰 데이터]
    {review_text}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        if raw_text.startswith("
