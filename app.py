import streamlit as st
import json
import requests
import urllib.parse
import time
from datetime import datetime

# ==========================================
# 🚀 0. 앱 메타데이터 및 버전 정보
# ==========================================
APP_VERSION = "v2.0.8"
UPDATE_HISTORY = """
**[v2.0.8] - 2026.03.13**
- ✨ **신규 기능:** 화면 상단 스텝(Step) 인디케이터 추가로 현재 진행 상황 직관화
- 🎨 **UI 개선:** 결과 링크 강조 UI에서 불필요하게 큰 부가 텍스트 축소 및 여백 조정
- 🧠 **AI 프롬프트 최적화:** 한국어 리뷰의 경우 중복되는 한국어 번역 과정 패스 지시
- 🐛 **예외 처리:** 패치노트가 이미지로만 구성되어 텍스트 요약이 불가능할 경우 "상세 내용은 위 링크를 확인해주세요"로 전문적인 대체 문구 출력 적용

**[v2.0.7] - 2026.03.13**
- 🎨 **UI/UX 전면 개편:** 스텝별 직관성 강화 (What은 강조하고 Why는 토글로 숨기는 정보 위계 적용)

**[v2.0.6] - 2026.03.13**
- 🐛 **AI 로직 픽스:** 뉴스 요약 출력 및 세부 평가 카테고리 무제한 도출 강제 적용

**[v2.0.5] - 2026.03.13**
- ⏳ **UX 개선:** 데이터 탈곡 시각적 진행률(Progress) 게이지 바 추가
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
NOTION_PUBLISH_URL = f"https://childlike-binder-ad2.notion.site/{NOTION_DATABASE_ID}"

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
        release_date = datetime(2020, 1, 1)
        
    return app_id, exact_name, release_date

def fetch_latest_news(app_id):
    url = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=5&maxlength=3000&format=json"
    try:
        res = requests.get(url, timeout=5).json()
        news_items = res.get('appnews', {}).get('newsitems', [])
        
        if not news_items:
            return None, None, None
            
        for item in news_items:
            title_lower = item.get('title', '').lower()
            if 'update' in title_lower or 'patch' in title_lower or '패치' in title_lower or '업데이트' in title_lower:
                return item['title'], item.get('contents', ''), item['url']
                
        for item in news_items:
            if item.get('feed_type') == 1:
                return item['title'], item.get('contents', ''), item['url']
                
        return news_items[0]['title'], news_items[0].get('contents', ''), news_items[0]['url']
    except:
        pass
    return None, None, None

def get_smart_period(release_date):
    days_since = (datetime.now() - release_date).days
    if days_since < 3:
        return None, "전체 주요 동향", "출시 3일 미만으로 데이터가 적어 '전체 동향 대비 주요 동향' 위주로 분석했습니다."
    elif days_since < 7:
        return 3, "최근 3일 동향", "출시 7일 미만인 초기 게임이므로 '최근 3일 내 동향'을 기준으로 민심을 분석했습니다."
    elif days_since < 30:
        return 7, "최근 7일 동향", "출시 30일 미만의 신작이므로 '최근 7일 내 동향'을 기준으로 민심을 분석했습니다."
    return 30, "최근 30일 동향", "출시 30일 이상 경과하여 '최근 30일 내 동향'을 기준으로 민심을 분석했습니다."

def fetch_review_list(app_id, day_range=None):
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
    news_text = f"\n[최신 게임 업데이트/공지]\n- 제목: {news_title}\n- 내용: {news_contents[:1500]}" if news_title else "제공된 최신 뉴스가 없습니다."
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
    3. 리뷰 인용(quote) 시, 타 언어는 [원문]과 [한국어 번역]을 필수 기재할 것. **단, 원래 '한국어'로 작성된 리뷰인 경우 번역 과정은 무조건 패스하고 [원문]만 작성할 것.**
    4. [매우 중요] 국가별 세부 평가(country_analysis) 작성 시, 해당 국가 리뷰에 등장하는 **모든 주요 [긍정평가]/[부정평가] 카테고리를 제한 없이 최대한 많이 배열로 도출할 것.** (예시에 2개만 있다고 2개만 출력하면 절대 안 됨. 불만/호평 요소가 4~5개면 4~5개 전부 배열에 담을 것). 긍정 먼저, 부정 나중 순서 유지.
    5. news_summary는 제공된 [최신 게임 업데이트/공지] 내용의 핵심만 3~4개의 배열(List) 형태 요약문으로 반환할 것. (만약 내용이 너무 짧거나 없어 요약이 불가능하다면 빈 배열 []을 반환할 것)
    
    {{
      "critic_one_liner": "게임 여론과 핵심 맹점을 짚어주는 담백하고 위트있는 한줄평 (1문장)",
      "sentiment_analysis": "전체 누적 평가와 {recent_label} 민심을 비교 분석하는 코멘트 (1~2줄)",
      "language_analysis": "주요 흥행 국가 및 특징, 영어 비중이 높은 이유 등 분석 (1~2줄)",
      "final_summary_all": ["전체 올타임 여론 요약 1", "요약 2"],
      "final_summary_recent": ["{recent_label} 기준 최근 주요 여론 요약 1", "요약 2"],
      "ai_issue_pick": ["AI 발견 최근 특이 동향 1"],
      "news_summary": ["공지/업데이트의 가장 중요한 핵심 요약 1", "핵심 요약 2", "핵심 요약 3"],
      "global_category_summary": [
        {{ "category": "[긍정평가] 콘텐츠 관련 평가", "summary": ["요약 1", "요약 2"] }},
        {{ "category": "[부정평가] 최적화 관련 평가", "summary": ["요약 1", "요약 2"] }}
      ],
      "country_analysis": [
        {{
          "language": "🇰🇷 한국어 등 (국기 포함)",
          "categories": [
            {{ "name": "[긍정평가] 콘텐츠 관련 평가", "summary": ["요약 1"], "quote": "[👍 | ⏱️ 15h | ID: **1234]\\n[원문] (해당 언어 원문)\\n[한국어 번역] (해당 언어가 한국어라면 이 줄은 생략)" }},
            {{ "name": "[부정평가] 버그 및 최적화 평가", "summary": ["요약 1"], "quote": "[👎 | ⏱️ 2h | ID: **5678]\\n[원문] (해당 언어 원문)\\n[한국어 번역] (해당 언어가 한국어라면 이 줄은 생략)" }}
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
        
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:-3].strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:-3].strip()
            
        return json.loads(raw_text), None
    except Exception as e: 
        return None, str(e)

# ==========================================
# 🗑️ 5. 노션 제어 (삭제 및 업로드)
# ==========================================
def delete_notion_page(page_id):
    url = f"https://api.notion.com/v1/pages/{page_id}"
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Notion-Version": "2022-06-28"}
    requests.patch(url, headers=headers, json={"archived": True})

def upload_to_notion(app_id, game_name, store_stats, ai_data, recent_label, smart_reason, news_data):
    news_title, _, news_url = news_data
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}

    bot_info_callout = {
        "object": "block", "type": "callout", 
        "callout": {
            "icon": {"emoji": "🤖"}, "color": "blue_background", 
            "rich_text": [
                {"text": {"content": f"[{APP_VERSION}] 스팀 사용자 리뷰 분석기\n", "link": None}, "annotations": {"bold": True, "color": "blue"}},
                {"text": {"content": "해당 봇은 게임의 핵심 배경정보를 선행 학습한 후, 글로벌 유저 민심을 분석하도록 업데이트되었습니다.\n"}},
                {"text": {"content": f"👉 {game_name} 스팀 상점 바로가기", "link": {"url": f"https://store.steampowered.com/app/{app_id}/"}}, "annotations": {"bold": True, "color": "blue", "underline": True}}
            ]
        }
    }
    
    page_title = f"[{datetime.now().strftime('%Y-%m-%d')}] {game_name} 평가 요약"
    create_data = {"parent": {"database_id": NOTION_DATABASE_ID}, "properties": {"이름": {"title": [{"text": {"content": page_title}}]}}}
    
    create_res = requests.post("https://api.notion.com/v1/pages", headers=headers, data=json.dumps(create_data))
    if create_res.status_code != 200: return None, create_res.text
    page_id = create_res.json()['id']
    
    children_blocks = [
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 리뷰 추출 기준 (클릭해서 펼치기)"}, "annotations": {"color": "gray", "bold": True}}], "children": [bot_info_callout]}},
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI의 한줄평"}}]}},
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞"}, "annotations": {"color": "blue"}}]}},
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},{"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": f"💡 왜 '{recent_label}' 기준으로 분석했나요?"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": smart_reason}}]}}]}},
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}},
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}},
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 [전체 누적 평가 주요 여론]"}, "annotations": {"color": "blue", "bold": True}}]}}
    ]
    
    for summary_line in ai_data.get('final_summary_all', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": summary_line}}]}})
        
    children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🔥 [{recent_label} 주요 여론]"}, "annotations": {"color": "red", "bold": True}}]}})
    for summary_line in ai_data.get('final_summary_recent', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": summary_line}}]}})
    
    children_blocks.extend([
        {"object": "block", "type": "divider", "divider": {}},
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🚨 [AI 이슈 픽] 체크포인트"}}]}},
    ])
    for issue in ai_data.get('ai_issue_pick', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": issue}}]}})
    
    if news_title:
        children_blocks.extend([
            {"object": "block", "type": "divider", "divider": {}},
            {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📢 최신 게임 공지/패치노트"}}]}},
            {"object": "block", "type": "callout", "callout": {
                "icon": {"emoji": "🔗"}, 
                "color": "gray_background", 
                "rich_text": [{"text": {"content": news_title, "link": {"url": news_url}}, "annotations": {"bold": True, "underline": True}}]
            }}
        ])
        
        news_summary_data = ai_data.get('news_summary', [])
        if isinstance(news_summary_data, str):
            news_summary_data = [news_summary_data]
            
        # 💡 우아한 예외 처리: 배열이 비어있거나, 내용이 없으면 전문적인 대체 문구 출력
        if news_summary_data and any(line.strip() for line in news_summary_data):
            for news_line in news_summary_data:
                if news_line.strip():
                    children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": news_line}}]}})
        else:
            children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "상세 내용은 위 링크를 확인해주세요.", "annotations": {"color": "gray"}}}]}})

    children_blocks.extend([
        {"object": "block", "type": "divider", "divider": {}},
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📁 카테고리별 종합 평가"}}]}}
    ])
    for cat in ai_data.get('global_category_summary', []):
        color = "blue" if "[긍정" in cat.get('category', '') else ("red" if "[부정" in cat.get('category', '') else "default")
        children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": cat.get('category', '')}, "annotations": {"color": color}}]}})
        for line in cat.get('summary', []):
            children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
        
    children_blocks.append({"object": "block", "type": "divider", "divider": {}})
    children_blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌐 전 세계 누적 리뷰 작성 언어 비중"}}]}})
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"총 누적 리뷰 수: {store_stats['all_total']:,}개 (전체 언어 취합 기준)"}, "annotations": {"bold": True, "color": "gray"}}]}})
    
    table_rows = [
        {"type": "table_row", "table_row": {"cells": [
            [{"text": {"content": "순위"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "언어"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "누적 리뷰 수"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "비중"}, "annotations": {"bold": True, "color": "gray"}}]
        ]}}
    ]
    
    sorted_langs = sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:10]
    total_all_langs = store_stats['all_total']
    for idx, (lang_code, count) in enumerate(sorted_langs):
        ratio = (count / total_all_langs) * 100 if total_all_langs > 0 else 0
        table_rows.append({"type": "table_row", "table_row": {"cells": [
            [{"text": {"content": f"{idx+1}위"}}], 
            [{"text": {"content": get_lang_name(lang_code)}}], 
            [{"text": {"content": f"{count:,}개"}}], 
            [{"text": {"content": f"{ratio:.1f}%"}}]
        ]}})
        
    children_blocks.append({"object": "block", "type": "table", "table": {"table_width": 4, "has_column_header": True, "has_row_header": False, "children": table_rows}})
    
    children_blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🌍"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('language_analysis', '언어 분석 코멘트 없음')}}]}})
    disclaimer_text = "언어 비중 표는 표본이 아닌 '스팀에 등록된 전체 리뷰'를 대상으로 구성되었습니다. 스팀 특성상 비영어권 유저들도 다수에게 의견을 전달하기 위해 공용어인 '영어'로 작성하는 경향이 있어 실제 플레이 유저 비례보다 영어 리뷰 비중이 높게 나타날 수 있습니다."
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": disclaimer_text}, "annotations": {"italic": True, "color": "gray"}}]}})

    children_blocks.append({"object": "block", "type": "divider", "divider": {}})
    children_blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 국가별 세부 평가 분석 (TOP 3 + 한국)"}}]}})
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "가장 많은 평가가 입력된 언어 상위 3개와 한국의 주요 평가에 대해 정리합니다."}, "annotations": {"color": "gray"}}]}})
    
    for country in ai_data.get('country_analysis', []):
        children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}, "annotations": {"color": "purple", "bold": True}}]}})
        for cat in country.get('categories', []):
            color = "blue" if "[긍정" in cat.get('name', '') else ("red" if "[부정" in cat.get('name', '') else "default")
            children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat.get('name', '')}, "annotations": {"bold": True, "color": color}}]}})
            for line in cat.get('summary', []):
                children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
            
            children_blocks.append({
                "object": "block", 
                "type": "toggle", 
                "toggle": {
                    "rich_text": [{"text": {"content": "👀 실제 유저 평가 원문 보기"}, "annotations": {"color": "gray"}}], 
                    "children": [{"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}}]
                }
            })
            
    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    for i in range(0, len(children_blocks), 100):
        requests.patch(append_url, headers=headers, data=json.dumps({"children": children_blocks[i:i+100]}))
        time.sleep(0.5) 
        
    return page_id

# ==========================================
# 🚀 6. 스트림릿 UI (진행도 표시 함수 추가)
# ==========================================
def render_step_indicator(current_step):
    """화면 상단에 현재 진행 단계를 예쁘게 표시해주는 함수"""
    steps = ["정보 입력", "검수 및 피드백", "분석 완료"]
    cols = st.columns(3)
    for i, col in enumerate(cols):
        if i < current_step:
            col.markdown(f"<div style='text-align: center; color: gray;'>✅ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        elif i == current_step:
            col.markdown(f"<div style='text-align: center; font-weight: bold; color: #0066cc;'>🟢 Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        else:
            col.markdown(f"<div style='text-align: center; color: lightgray;'>⚪ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
    st.divider()

def main():
    with st.sidebar:
        st.markdown("### 📚 통합 리포트 열람")
        st.link_button("👉 노션 데이터베이스 보러가기", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        
        st.markdown(f"### ⚙️ 시스템 정보\n**버전:** `{APP_VERSION}`")
        with st.expander("🛠️ 업데이트 이력 (Changelog)"):
            st.markdown(UPDATE_HISTORY)

    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 게임의 글로벌 리뷰, 최신 뉴스, 배경정보를 종합 분석하여 노션으로 추출합니다.")
    
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"page_id": None, "app_id": None, "game_name": None, "reviews_all": None, "reviews_recent": None, "store_stats": None, "recent_label": None, "smart_reason": None, "news_data": None})

    # 상단 공통 스텝 인디케이터 렌더링
    render_step_indicator(st.session_state.step)

    # ==========================================
    # [STEP 0] 데이터 입력 및 분석 시작
    # ==========================================
    if st.session_state.step == 0:
        game_input = st.text_input("게임의 영문명 또는 App ID를 입력하세요", placeholder="예: 3564740 또는 Helldivers 2")
        
        with st.expander("💡 왜 App ID 입력을 권장하나요? (클릭해서 읽어보기)"):
            st.markdown("- 스팀 상점 주소(`store.steampowered.com/app/123450/`)의 **숫자(`123450`)**가 App ID입니다.\n- 게임 이름이 흔하거나 겹칠 경우 엉뚱한 게임이 검색될 수 있어, 정확한 타겟팅을 위해 App ID를 권장합니다.")
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            if not game_input:
                st.warning("게임을 입력해주세요!")
                return
            
            with st.status("스팀 데이터를 탈곡하고 있습니다... 🌾 (약 60초 소요)", expanded=True) as status:
                progress_bar = st.progress(0)
                
                st.write("🔍 1/5: 게임 정보 및 출시일 분석 중...")
                app_id, game_name, release_date = get_steam_game_info(game_input)
                if not app_id:
                    status.update(label="검색 실패", state="error")
                    st.error("게임을 찾을 수 없습니다. App ID를 확인해주세요.")
                    return
                progress_bar.progress(10)
                
                recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                st.write(f"📅 출시일 기반 스마트 분석 적용: **[{recent_label}]** 기준")
                progress_bar.progress(20)
                
                st.write("📰 2/5: 스팀 최신 업데이트 뉴스/공지 수집 중...")
                news_data = fetch_latest_news(app_id)
                if news_data and news_data[0]:
                    st.write(f"  👉 [발견된 공지]: {news_data[0]}")
                else:
                    st.write("  👉 스팀 최신 뉴스를 찾을 수 없습니다.")
                st.session_state.update({"app_id": app_id, "game_name": game_name, "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data})
                progress_bar.progress(30)

                st.write("📥 3/5: 스팀 글로벌 리뷰 데이터 수집 중...")
                reviews_all, reviews_recent, store_stats = fetch_steam_reviews(app_id, recent_days_val)
                st.session_state.update({"reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats})
                progress_bar.progress(50)

                st.write("🧠 4/5: AI가 게임 배경정보와 팩트를 교차 검증하며 다차원 분석 중입니다... (가장 오래 걸려요!)")
                insights, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data)
                if err:
                    status.update(label="AI 분석 실패", state="error")
                    st.error(f"AI 분석 중 에러가 발생했습니다: {err}")
                    return
                progress_bar.progress(80)

                st.write("📝 5/5: 노션 리포트 생성 및 임베드 중...")
                page_id = upload_to_notion(app_id, game_name, store_stats, insights, recent_label, smart_reason, news_data)
                if not page_id:
                    status.update(label="노션 업로드 실패", state="error")
                    st.error(f"노션 업로드 에러가 발생했습니다.")
                    return
                
                progress_bar.progress(100)
                st.session_state.page_id = page_id
                st.session_state.step = 1
                status.update(label="✅ 리포트 초안 작성 완료!", state="complete")
            st.rerun()

    # ==========================================
    # [STEP 1] 노션 확인 및 피드백 수정
    # ==========================================
    elif st.session_state.step == 1:
        st.markdown("#### 1. 생성된 리포트 초안 확인하기")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        # 큰 텍스트는 줄이고, 버튼(링크)만 직관적이고 크게!
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #f0f2f6; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #0066cc; font-weight: bold;">
                👉 작성된 리포트 초안 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("#### 2. 리포트 수정 또는 완료 선택")
        feedback = st.text_area("내용 수정이 필요하다면 아래에 피드백을 자유롭게 적어주세요. (완벽하다면 바로 최종 승인 클릭!)", placeholder="예: 한국어 최적화 불만 부분을 더 구체적으로 써줘")
        
        with st.expander("💡 피드백 기능 이용 시 주의사항 (클릭해서 읽어보기)"):
            st.markdown("- AI가 놓친 포인트나 추가로 강조하고 싶은 내용을 지시할 수 있습니다.\n- **[주의]** 피드백을 반영하여 리포트를 재작성할 경우, 기존 노션 페이지는 자동으로 휴지통으로 이동되고 새로운 페이지로 교체됩니다.")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 피드백 반영하여 재작성", use_container_width=True):
                if not feedback.strip():
                    st.error("피드백 내용을 입력해주세요.")
                else:
                    with st.status("피드백을 반영하여 다시 탈곡 중입니다... 🌾", expanded=True) as status:
                        feedback_progress = st.progress(0)
                        
                        st.write("🗑️ 1/3: 기존 노션 초안 페이지 삭제 중...")
                        delete_notion_page(st.session_state.page_id)
                        feedback_progress.progress(20)

                        st.write("🧠 2/3: AI가 피드백을 반영하여 재분석 중입니다... (약 60초 소요)")
                        insights, err = analyze_with_gemini(
                            st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, 
                            st.session_state.store_stats, st.session_state.recent_label, st.session_state.news_data, feedback
                        )
                        if err:
                            status.update(label="AI 분석 실패", state="error")
                            st.error(f"AI 에러: {err}")
                            st.stop()
                        feedback_progress.progress(70)

                        st.write("📝 3/3: 수정된 노션 리포트 업로드 중...")
                        new_page_id = upload_to_notion(
                            st.session_state.app_id, st.session_state.game_name, st.session_state.store_stats, 
                            insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data
                        )
                        feedback_progress.progress(100)
                        
                        st.session_state.page_id = new_page_id
                        status.update(label="✅ 재작성 완료!", state="complete")
                    st.rerun()

        with col2:
            if st.button("✅ 리포트 최종 승인 (완료)", type="primary", use_container_width=True):
                st.session_state.step = 2
                st.rerun()

    # ==========================================
    # [STEP 2] 완료 화면
    # ==========================================
    elif st.session_state.step == 2:
        st.balloons()
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #e8f5e9; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #2e7d32; font-weight: bold;">
                👉 최종 노션 리포트 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.divider()
        if st.button("🔄 새로운 게임 분석하기", use_container_width=True):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()
