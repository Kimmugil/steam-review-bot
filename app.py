import streamlit as st
import json
import requests
import urllib.parse
import time
from datetime import datetime

# ==========================================
# 🚀 0. 앱 메타데이터 및 버전 정보
# ==========================================
APP_VERSION = "v2.0.3"
UPDATE_HISTORY = """
**[v2.0.3] - 2026.03.12**
- 🎨 **UI/UX 대폭 개선:** - 리뷰 원문 토글(접기/펼치기) 적용으로 가독성 향상
  - 사이드바에 통합 리포트 노션 DB 다이렉트 링크 추가
  - 최신 공지/패치노트 임베드 디자인 개선 및 요약 방식(글머리 기호) 변경
- 📊 **누락 데이터 복구:** 국가별 누적 리뷰 비중(표) 및 영어권 편향 안내 텍스트 복구

**[v2.0.2] - 2026.03.12**
- 🛡️ **신뢰도 패치 및 최적화:** AI 배경정보 학습 프롬프트 워딩 정제 및 내부 로직 최적화

**[v2.0.1] - 2026.03.12**
- 🛡️ **AI 팩트체크 강화:** 배경정보 학습 시 유저 사견/루머 배제 지시 추가

**[v2.0.0] - 2026.03.12**
- 🧠 **AI 배경정보 선행 학습 & 스팀 뉴스 연동 기능 추가**
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
# 무길이의 공개 노션 사이트 링크
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
      "news_summary": ["제공된 뉴스의 핵심 요약 1", "핵심 요약 2 (배열 형태로 작성. 뉴스가 없으면 빈 배열 [] 반환)"],
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
    
    # 공지사항/패치노트 섹션: 리스팅 형태로 분리!
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
        for news_line in ai_data.get('news_summary', []):
            children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": news_line}}]}})

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
    
    # 누락되었던 언어 비중 표 복구!
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
    
    # 누락되었던 영어권 편향 안내 텍스트 복구!
    children_blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🌍"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('language_analysis', '언어 분석 코멘트 없음')}}]}})
    disclaimer_text = "언어 비중 표는 표본이 아닌 '스팀에 등록된 전체 리뷰'를 대상으로 구성되었습니다. 스팀 특성상 비영어권 유저들도 다수에게 의견을 전달하기 위해 공용어인 '영어'로 작성하는 경향이 있어 실제 플레이 유저 비례보다 영어 리뷰 비중이 높게 나타날 수 있습니다."
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": disclaimer_text}, "annotations": {"italic": True, "color": "gray"}}]}})

    children_blocks.append({"object": "block", "type": "divider", "divider": {}})
    children_blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 국가별 세부 평가 분석 (TOP 3 + 한국)"}}]}})
    # 섹션 하단 배경 설명 추가!
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "가장 많은 평가가 입력된 언어 상위 3개와 한국의 주요 평가에 대해 정리합니다."}, "annotations": {"color": "gray"}}]}})
    
    for country in ai_data.get('country_analysis', []):
        children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}, "annotations": {"color": "purple", "bold": True}}]}})
        for cat in country.get('categories', []):
            color = "blue" if "[긍정" in cat.get('name', '') else ("red" if "[부정" in cat.get('name', '') else "default")
            children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat.get('name', '')}, "annotations": {"bold": True, "color": color}}]}})
            for line in cat.get('summary', []):
                children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
            
            # 유저 평가 원문을 토글(접기) 블록 안으로 쏙!
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
        
    return page_id, None

# ==========================================
# 🚀 6. 스트림릿 UI 메인 루프
# ==========================================
def main():
    with st.sidebar:
        # 무길이가 원했던 "어디서나 접근 가능한" 글로벌 DB 링크 버튼 추가!
        st.markdown("### 📚 통합 리포트 열람")
        st.link_button("👉 노션 데이터베이스 보러가기", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        
        st.markdown(f"### ⚙️ 시스템 정보\n**버전:** `{APP_VERSION}`")
        with st.expander("🛠️ 업데이트 이력 (Changelog)"):
            st.markdown(UPDATE_HISTORY)

    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 게임의 글로벌 리뷰, 최신 뉴스, 배경정보를 종합 분석하여 노션으로 추출합니다.")
    st.divider()

    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"page_id": None, "app_id": None, "game_name": None, "reviews_all": None, "reviews_recent": None, "store_stats": None, "recent_label": None, "smart_reason": None, "news_data": None})

    if st.session_state.step == 0:
        game_input = st.text_input("👉 분석할 게임의 영문명 또는 App ID를 입력하세요", placeholder="예: 3564740 또는 Helldivers 2")
        
        st.info("💡 **App ID란?** 스팀 상점 페이지 주소(`store.steampowered.com/app/123450/`)에서 숫자 부분(`123450`)을 의미합니다. 정확한 타겟팅을 위해 App ID 입력을 권장합니다.")
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            if not game_input:
                st.warning("게임을 입력해주세요!")
                return
            
            with st.status("스팀 데이터를 탈곡하고 있습니다... 🌾 (약 60초 소요)", expanded=True) as status:
                st.write("🔍 게임 정보 및 출시일 분석 중...")
                app_id, game_name, release_date = get_steam_game_info(game_input)
                if not app_id:
                    status.update(label="검색 실패", state="error")
                    st.error("게임을 찾을 수 없습니다. App ID를 확인해주세요.")
                    return
                
                recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                st.write(f"📅 출시일 기반 스마트 분석 적용: **[{recent_label}]** 기준")
                
                st.write("📰 스팀 최신 업데이트 뉴스/공지 수집 중...")
                news_data = fetch_latest_news(app_id)
                st.session_state.update({"app_id": app_id, "game_name": game_name, "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data})

                st.write("📥 스팀 글로벌 리뷰 데이터 수집 중...")
                reviews_all, reviews_recent, store_stats = fetch_steam_reviews(app_id, recent_days_val)
                st.session_state.update({"reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats})

                st.write("🧠 AI가 게임 배경정보와 팩트를 교차 검증하며 다차원 분석 중입니다... (약 60초 소요)")
                insights, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data)
                if err:
                    status.update(label="AI 분석 실패", state="error")
                    st.error(f"AI 분석 중 에러가 발생했습니다: {err}")
                    return

                st.write("📝 노션 리포트 생성 및 임베드 중...")
                page_id, err_notion = upload_to_notion(app_id, game_name, store_stats, insights, recent_label, smart_reason, news_data)
                if not page_id:
                    status.update(label="노션 업로드 실패", state="error")
                    st.error(f"노션 에러: {err_notion}")
                    return

                st.session_state.page_id = page_id
                st.session_state.step = 1
                status.update(label="✅ 리포트 초안 작성 완료!", state="complete")
            st.rerun()

    elif st.session_state.step == 1:
        st.success("🎉 노션 리포트 초안이 성공적으로 생성되었습니다!")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #f0f2f6; text-align: center; margin-bottom: 20px;">
            <h3 style="margin-top:0;">👀 생성된 리포트 확인하기</h3>
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #0066cc; font-weight: bold;">
                👉 [여기]를 클릭하여 노션 리포트 열기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.info("리포트 내용을 확인하신 후, 마음에 드시면 '최종 승인'을 누르시고, 수정이 필요하다면 아래에 피드백을 입력해주세요.")
        st.divider()
        
        st.subheader("🛠️ 리포트 추가 피드백")
        # "당황하지 마세요" 삭제 및 문구 정제!
        st.warning("🚨 **[안내]** 피드백을 반영하여 재생성할 경우, 기존에 생성된 노션 페이지는 자동으로 휴지통으로 이동되고 새로운 페이지로 교체됩니다.")
        
        feedback = st.text_area("AI에게 반영할 추가 피드백을 적어주세요", placeholder="예: 한국어 최적화 불만 부분을 더 구체적으로 써줘")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🚀 피드백 반영하여 재작성", use_container_width=True):
                if not feedback.strip():
                    st.error("피드백 내용을 입력해주세요.")
                else:
                    with st.status("피드백을 반영하여 다시 탈곡 중입니다... 🌾", expanded=True) as status:
                        st.write("🗑️ 기존 노션 초안 페이지 삭제 중...")
                        delete_notion_page(st.session_state.page_id)

                        st.write("🧠 AI가 피드백을 반영하여 재분석 중입니다... (약 60초 소요)")
                        insights, err = analyze_with_gemini(
                            st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, 
                            st.session_state.store_stats, st.session_state.recent_label, st.session_state.news_data, feedback
                        )
                        if err:
                            status.update(label="AI 분석 실패", state="error")
                            st.error(f"AI 에러: {err}")
                            st.stop()

                        st.write("📝 수정된 노션 리포트 업로드 중...")
                        new_page_id, err_notion = upload_to_notion(
                            st.session_state.app_id, st.session_state.game_name, st.session_state.store_stats, 
                            insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data
                        )
                        st.session_state.page_id = new_page_id
                        status.update(label="✅ 재작성 완료!", state="complete")
                    st.rerun()

        with col2:
            if st.button("✅ 리포트 최종 승인 (완료)", type="primary", use_container_width=True):
                st.session_state.step = 2
                st.rerun()

    elif st.session_state.step == 2:
        st.balloons()
        st.success("🎉 최종 리포트 작성이 완벽하게 끝났습니다! 수고하셨습니다.")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #e8f5e9; text-align: center; margin-bottom: 20px;">
            <h3 style="margin-top:0; color: #2e7d32;">📄 완성된 최종 리포트</h3>
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #2e7d32; font-weight: bold;">
                👉 최종 노션 리포트 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.divider()
        if st.button("🔄 새로운 게임 분석하기"):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()
