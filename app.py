import streamlit as st
import json
import requests
import urllib.parse
import time
import sys
from datetime import datetime, timezone

# 🚜 페이지 기본 설정 (가장 위에 와야 함)
st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="centered")

# ==========================================
# 🔑 1. API 키 및 토큰 설정 (🔥 보안 금고 사용! 🔥)
# ==========================================
try:
    GEMINI_API_KEY = st.secrets["GEMINI_API_KEY"]
    NOTION_TOKEN = st.secrets["NOTION_TOKEN"]
except KeyError:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았습니다! 배포 설정(Advanced settings)을 확인해주세요.")
    st.stop()

NOTION_DATABASE_ID = "321fa327f28680dc8df5fe92fab193bf" # 데이터베이스 ID는 노출되어도 키가 없으면 안전합니다.

# ==========================================
# 🌐 2. 언어 매핑 & 스팀 등급 9단계 사전
# ==========================================
LANG_MAP = {
    "koreana": "🇰🇷 한국어", "english": "🇺🇸 영어", "schinese": "🇨🇳 중국어(간체)", 
    "tchinese": "🇹🇼 중국어(번체)", "japanese": "🇯🇵 일본어", "russian": "🇷🇺 러시아어", 
    "spanish": "🇪🇸 스페인어", "german": "🇩🇪 독일어", "french": "🇫🇷 프랑스어", 
    "portuguese": "🇵🇹 포르투갈어", "brazilian": "🇧🇷 포르투갈어(브라질)", "polish": "🇵🇱 폴란드어"
}

def get_lang_name(lang_code):
    return LANG_MAP.get(lang_code, f"🏳️ {lang_code}")

SCORE_MAP = {
    1: "압도적으로 부정적 (Overwhelmingly Negative)", 
    2: "매우 부정적 (Very Negative)", 
    3: "부정적 (Negative)", 
    4: "대체로 부정적 (Mostly Negative)",
    5: "복합적 (Mixed)", 
    6: "대체로 긍정적 (Mostly Positive)", 
    7: "긍정적 (Positive)", 
    8: "매우 긍정적 (Very Positive)", 
    9: "압도적으로 긍정적 (Overwhelmingly Positive)"
}

def calculate_custom_score(pos_ratio, total):
    if total == 0: return "평가 없음 (최근 30일 리뷰 없음)"
    if pos_ratio >= 0.95: return "압도적으로 긍정적 (Overwhelmingly Positive)"
    elif pos_ratio >= 0.80: return "매우 긍정적 (Very Positive)"
    elif pos_ratio >= 0.70: return "대체로 긍정적 (Mostly Positive)"
    elif pos_ratio >= 0.40: return "복합적 (Mixed)"
    elif pos_ratio >= 0.20: return "대체로 부정적 (Mostly Negative)"
    elif pos_ratio >= 0.01: return "매우 부정적 (Very Negative)"
    elif pos_ratio == 0: return "압도적으로 부정적 (Overwhelmingly Negative)"
    return "평가 없음"

# ==========================================
# 🎮 3. 스팀 게임 검색 
# ==========================================
def get_steam_game_info(game_input):
    if game_input.isdigit():
        app_id = game_input
        details_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean"
        res = requests.get(details_url).json()
        if not res or str(app_id) not in res or not res[str(app_id)]['success']: 
            return None, None, None
        exact_name = res[str(app_id)]['data']['name']
    else:
        res = requests.get(f"https://store.steampowered.com/api/storesearch/?term={game_input}&l=korean&cc=KR").json()
        if not res.get('items'): 
            return None, None, None
        app_id = str(res['items'][0]['id'])
        exact_name = res['items'][0]['name']
        
    try: 
        release_date = datetime.strptime(requests.get(f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean").json()[str(app_id)]['data']['release_date']['date'], "%Y년 %m월 %d일").strftime("%Y-%m-%d")
    except: 
        release_date = "2024-01-01"
        
    safe_exact_name = exact_name.encode('utf-8', 'ignore').decode('utf-8')
    return app_id, safe_exact_name, release_date

# ==========================================
# 📥 4. 스팀 리뷰 데이터 수집 
# ==========================================
def fetch_review_list(app_id, day_range=None):
    reviews = []
    base_url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=all&language=all&num_per_page=100&purchase_type=all"
    if day_range:
        base_url += f"&day_range={day_range}"
        
    pos_count = 0
    cursor = "*"
    for _ in range(5): 
        url = base_url + f"&cursor={urllib.parse.quote(cursor)}"
        res = requests.get(url).json()
        if not res.get('reviews'): break
        for r in res['reviews']:
            safe_review_text = r['review'][:400].replace('\n', ' ').encode('utf-8', 'ignore').decode('utf-8')
            reviews.append({
                "language": r['language'], 
                "is_positive": r['voted_up'],
                "playtime": round(r['author'].get('playtime_at_review', 0) / 60, 1),
                "steam_id": str(r['author'].get('steamid', '익명'))[-4:],
                "review": safe_review_text
            })
            if r['voted_up']: pos_count += 1
            
        cursor = res.get('cursor', '*')
        if not cursor: break
    return reviews, pos_count

def fetch_steam_reviews(app_id):
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
    score_all = summary_all.get('review_score', 0)

    reviews_all, pos_all = fetch_review_list(app_id, day_range=None)
    reviews_recent, pos_recent = fetch_review_list(app_id, day_range=30)
    
    recent_total_sampled = len(reviews_recent)
    pos_ratio_recent = pos_recent / recent_total_sampled if recent_total_sampled > 0 else 0
    recent_custom_desc = calculate_custom_score(pos_ratio_recent, recent_total_sampled)
    
    store_stats = {
        "all_desc": SCORE_MAP.get(score_all, "평가 없음"),
        "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc,
        "recent_total": recent_total_sampled, 
        "total_lang_counts": total_lang_counts 
    }
        
    lang_counts_combined = {}
    for r in reviews_all + reviews_recent:
        lang_counts_combined[r['language']] = lang_counts_combined.get(r['language'], 0) + 1
    
    top_langs_keys = [l[0] for l in sorted(lang_counts_combined.items(), key=lambda x: x[1], reverse=True)[:3]]
    if "koreana" not in top_langs_keys and "koreana" in lang_counts_combined:
        top_langs_keys.append("koreana")
    
    filtered_reviews_all = {lang: [] for lang in top_langs_keys}
    for r in reviews_all:
        if r['language'] in top_langs_keys and len(filtered_reviews_all[r['language']]) < 20:
            sentiment = "👍 추천" if r['is_positive'] else "👎 비추천"
            filtered_reviews_all[r['language']].append(f"[{sentiment} | ⏱️ {r['playtime']}시간 | 👤 ID: ****{r['steam_id']}] {r['review']}")

    filtered_reviews_recent = {lang: [] for lang in top_langs_keys}
    for r in reviews_recent:
        if r['language'] in top_langs_keys and len(filtered_reviews_recent[r['language']]) < 20:
            sentiment = "👍 추천" if r['is_positive'] else "👎 비추천"
            filtered_reviews_recent[r['language']].append(f"[{sentiment} | ⏱️ {r['playtime']}시간 | 👤 ID: ****{r['steam_id']}] {r['review']}")

    return filtered_reviews_all, filtered_reviews_recent, store_stats

# ==========================================
# 🧠 5. AI 리뷰 분석 (REST API 통신)
# ==========================================
def analyze_with_gemini(game_name, review_data_all, review_data_recent, store_stats, user_feedback=""):
    top_langs_str = ", ".join([f"{get_lang_name(k)}: {v:,}개" for k, v in sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:7]])
    
    review_text = "==== [전체 누적 평가 주요 리뷰 (All-time)] ====\n"
    for lang, revs in review_data_all.items():
        if revs: review_text += f"\n🌍 [언어: {get_lang_name(lang)}]\n" + "\n".join(revs)
        
    review_text += "\n\n==== [최근 30일 평가 주요 리뷰 (Recent 30 days)] ====\n"
    for lang, revs in review_data_recent.items():
        if revs: review_text += f"\n🌍 [언어: {get_lang_name(lang)}]\n" + "\n".join(revs)
        
    feedback_instruction = f"\n\n🚨 [사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{user_feedback}\n" if user_feedback else ""
        
    prompt = f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'의 스팀 유저 평가 데이터야.{feedback_instruction}
    
    [통계 데이터]
    - 전체 누적 평가: {store_stats['all_desc']}
    - 최근 30일 민심: {store_stats['recent_desc']}
    - 전 세계 누적 리뷰 언어 비중: {top_langs_str}
    
    ⚠️ 작성 규칙:
    1. 마크다운 기호(**, # 등) 절대 금지.
    2. 요약 배열(summary) 요소는 간결하게 작성할 것.
    3. [중요] 카테고리 요약 시, 해당 카테고리가 긍정적인 내용이면 카테고리명 앞에 "[긍정평가]", 부정적인 내용이면 "[부정평가]"를 반드시 붙일 것.
    4. [순서 엄수] global_category_summary 및 country_analysis의 카테고리 배열을 작성할 때 무조건 '[긍정평가]' 항목들을 먼저 모두 나열하고, 그 뒤에 '[부정평가]' 항목들을 나열할 것.
    5. [번역 엄수] 한국어가 아닌 언어(영어, 중국어 등)의 리뷰 원문을 인용할 때는 원문만 달랑 쓰지 말고, 반드시 아래 예시처럼 [원문]과 [한국어 번역]을 모두 기재할 것. 절대 누락 금지. (단, 한국어 리뷰인 경우 번역 생략 가능)
    6. [인용 원칙] quote 란에는 해당 카테고리의 요약을 가장 완벽하게 대변하는 찐 유저 평가 1개만 엄선할 것.
    
    {{
      "critic_one_liner": "게임의 현재 여론과 핵심 맹점을 짚어주는 담백하고 센스 있는 한줄평 (과도한 비유나 오글거리는 감성은 빼고, 객관적 사실 기반에 약간의 위트만 섞어서 1문장으로 작성)",
      "sentiment_analysis": "전체 누적 평가({store_stats['all_desc']})와 최근 30일 민심({store_stats['recent_desc']})을 비교하여, 왜 이런 차이나 흐름이 발생하는지 분석하는 코멘트 (1~2줄)",
      "language_analysis": "언어 비중 데이터를 바탕으로 이 게임의 주요 흥행 국가 및 특징을 짚어주고, 영어 리뷰 비중이 높은 이유 등을 포함하여 분석하는 코멘트 (1~2줄)",
      "final_summary_all": [
        "전체 누적 평가 데이터를 바탕으로 한 올타임 주요 여론 요약 1",
        "요약 2"
      ],
      "final_summary_recent": [
        "최근 30일 평가 데이터를 바탕으로 한 최근 주요 여론 요약 1 (전체와 비교해 최근 불만/호평이 집중된 부분)",
        "요약 2"
      ],
      "ai_issue_pick": [
        "AI 발견 최근 특이 동향 1"
      ],
      "global_category_summary": [
        {{ "category": "[긍정평가] 콘텐츠 관련 평가", "summary": ["요약 1", "요약 2"] }},
        {{ "category": "[부정평가] 최적화 관련 평가", "summary": ["요약 1", "요약 2"] }}
      ],
      "country_analysis": [
        {{
          "language": "🇰🇷 한국어 등 (국기 포함)",
          "categories": [
            {{
              "name": "[긍정평가] 콘텐츠 관련 평가",
              "summary": ["해당 국가 평가 요약 1", "요약 2"],
              "quote": "[👍 추천 | ⏱️ 15.2시간 | 👤 ID: ****1234]\\n[원문] (한국어가 아닌 경우 원문 작성)\\n[한국어 번역] (한국어 번역본 작성, 절대 누락하지 말 것)"
            }}
          ]
        }}
      ]
    }}
    
    [리뷰 데이터]
    {review_text}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.3
        }
    }
    
    try:
        res = requests.post(url, headers=headers, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        result_data = res.json()
        
        if "candidates" not in result_data or not result_data["candidates"]:
            return None, "AI 응답이 비어있습니다."
            
        raw_text = result_data['candidates'][0]['content']['parts'][0]['text'].strip()
        
        json_marker = "`" * 3 + "json"
        code_marker = "`" * 3
        if raw_text.startswith(json_marker): raw_text = raw_text[7:-3].strip()
        elif raw_text.startswith(code_marker): raw_text = raw_text[3:-3].strip()
        return json.loads(raw_text), None
        
    except Exception as e: 
        safe_error = str(e).encode('utf-8', 'ignore').decode('utf-8')
        return None, safe_error

# ==========================================
# 🗑️ 6-1. 노션 이전 페이지 삭제
# ==========================================
def delete_notion_page(page_id):
    url = f"https://api.notion.com/v1/pages/{page_id}"
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Notion-Version": "2022-06-28"}
    requests.patch(url, headers=headers, json={"archived": True})

# ==========================================
# 📝 6-2. 노션 업로드
# ==========================================
def upload_to_notion(app_id, game_name, store_stats, ai_data):
    bot_info_callout = {
        "object": "block", 
        "type": "callout", 
        "callout": {
            "icon": {"emoji": "🤖"}, 
            "color": "blue_background", 
            "rich_text": [
                {"text": {"content": "[스팀 사용자 리뷰 분석기]"}, "annotations": {"bold": True, "color": "blue"}},
                {"text": {"content": "를 통해 작성되었습니다.\n해당 봇은 특정 게임에 대한 사용자 리뷰를 취합하고, 사용자 리뷰 데이터를 바탕으로 글로벌 유저 민심의 흐름과 특이사항 도출을 목적으로 설계되었습니다.\n"}},
                {
                    "text": {"content": f"👉 {game_name} 스팀 사용자 리뷰 바로가기", "link": {"url": f"https://steamcommunity.com/app/{app_id}/reviews/"}}, 
                    "annotations": {"bold": True, "color": "blue", "underline": True}
                }
            ]
        }
    }
    
    info_text = (
        f"💡 리뷰 추출 기준 안내\n"
        f"스팀의 전체 리뷰 수는 방대하지만, 본 리포트는 글로벌 민심을 입체적으로 분석하기 위해 '전체 기간 유용한 평가 500개'와 '최근 30일 유용한 평가 500개'를 각각 추출하여 총 1,000여 개의 핵심 리뷰를 기반으로 요약했습니다."
    )
    
    criteria_callout = {
        "object": "block", 
        "type": "callout", 
        "callout": {"icon": {"emoji": "ℹ️"}, "color": "gray_background", "rich_text": [{"text": {"content": info_text}}]}
    }
    
    page_title = f"[{datetime.now().strftime('%Y-%m-%d')}] {game_name} 스팀 평가 요약"
    create_url = "https://api.notion.com/v1/pages"
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}
    
    create_data = {
        "parent": {"database_id": NOTION_DATABASE_ID},
        "properties": {"이름": {"title": [{"text": {"content": page_title}}]}}
    }
    
    create_res = requests.post(create_url, headers=headers, data=json.dumps(create_data))
    if create_res.status_code != 200:
        return None, create_res.text
        
    page_id = create_res.json()['id']
    
    children_blocks = [
        {
            "object": "block", 
            "type": "toggle", 
            "toggle": {
                "rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 리뷰 추출 기준 (클릭해서 펼치기)"}, "annotations": {"color": "gray", "bold": True}}],
                "children": [bot_info_callout, criteria_callout]
            }
        },
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI의 한줄평"}}]}},
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '한줄평이 없습니다.')} ❞"}, "annotations": {"color": "blue"}}]}},
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
            {"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},
            {"text": {"content": f"🔥 최근 30일 민심: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}
        ]}},
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '분석 코멘트 없음')}}]}},
        
        {"object": "block", "type": "divider", "divider": {}},
        
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}},
        
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 [전체 누적 평가 주요 여론]"}, "annotations": {"color": "blue", "bold": True}}]}}
    ]
    
    for summary_line in ai_data.get('final_summary_all', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": summary_line}}]}})
        
    children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🔥 [최근 30일 평가 주요 여론]"}, "annotations": {"color": "red", "bold": True}}]}})
    
    for summary_line in ai_data.get('final_summary_recent', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": summary_line}}]}})
    
    children_blocks.extend([
        {"object": "block", "type": "divider", "divider": {}},
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🚨 [AI 이슈 픽] 체크포인트"}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "* AI가 최근 수집된 리뷰들을 분석하여 감지한 주요 특이사항 및 돌발 이슈입니다."}, "annotations": {"italic": True, "color": "gray"}}]}}
    ])
    
    for issue in ai_data.get('ai_issue_pick', []):
        children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": issue}}]}})
        
    children_blocks.extend([
        {"object": "block", "type": "divider", "divider": {}},
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📁 카테고리별 종합 평가"}}]}}
    ])
    
    for cat in ai_data.get('global_category_summary', []):
        cat_name = cat.get('category', '')
        color = "default"
        if "[긍정" in cat_name: color = "blue"
        elif "[부정" in cat_name: color = "red"
        
        children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": cat_name}, "annotations": {"color": color}}]}})
        for line in cat.get('summary', []):
            children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
        
    children_blocks.append({"object": "block", "type": "divider", "divider": {}})
    
    children_blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌐 전 세계 누적 리뷰 작성 언어 비중"}}]}})
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"총 누적 리뷰 수: {store_stats['all_total']:,}개 (전체 언어 취합 기준)"}, "annotations": {"bold": True, "color": "gray"}}]}})
    
    table_rows = []
    
    table_rows.append({
        "type": "table_row", 
        "table_row": {
            "cells": [
                [{"text": {"content": "순위"}, "annotations": {"bold": True, "color": "gray"}}], 
                [{"text": {"content": "언어"}, "annotations": {"bold": True, "color": "gray"}}], 
                [{"text": {"content": "누적 리뷰 수"}, "annotations": {"bold": True, "color": "gray"}}], 
                [{"text": {"content": "비중"}, "annotations": {"bold": True, "color": "gray"}}]
            ]
        }
    })
    
    sorted_langs = sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:10]
    total_all_langs = store_stats['all_total']
    
    for idx, (lang_code, count) in enumerate(sorted_langs):
        ratio = (count / total_all_langs) * 100 if total_all_langs > 0 else 0
        table_rows.append({
            "type": "table_row", 
            "table_row": {
                "cells": [
                    [{"text": {"content": f"{idx+1}위"}}], 
                    [{"text": {"content": get_lang_name(lang_code)}}], 
                    [{"text": {"content": f"{count:,}개"}}], 
                    [{"text": {"content": f"{ratio:.1f}%"}}]
                ]
            }
        })
        
    children_blocks.append({
        "object": "block", 
        "type": "table", 
        "table": {
            "table_width": 4, 
            "has_column_header": True, 
            "has_row_header": False, 
            "children": table_rows
        }
    })
    
    children_blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🌍"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('language_analysis', '언어 비중 코멘트 없음')}}]}})
    
    disclaimer_text = "언어 비중 표는 표본이 아닌 '스팀에 등록된 전체 리뷰'를 대상으로 구성되었습니다. 또한 스팀 특성상 비영어권 유저들도 다수에게 의견을 전달하기 위해 공용어인 '영어'로 작성하는 경향이 있어 실제 플레이 유저 비례보다 영어 리뷰 비중이 높게 나타납니다."
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": disclaimer_text}, "annotations": {"italic": True, "color": "gray"}}]}})
    
    children_blocks.append({"object": "block", "type": "divider", "divider": {}})
    children_blocks.append({"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 국가별 세부 평가 분석 (TOP 3 + 한국)"}}]}})
    
    total_samples = 1000 
    children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"수집된 유용한 리뷰 {total_samples}여 개 중 가장 많은 비중을 차지하는 국가 TOP 3와 한국에서의 항목별 주요 평가 내용입니다."}, "annotations": {"color": "gray"}}]}})
    
    for country in ai_data.get('country_analysis', []):
        children_blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}, "annotations": {"color": "purple", "bold": True}}]}})
        
        for cat in country.get('categories', []):
            cat_name = cat.get('name', '')
            color = "default"
            if "[긍정" in cat_name: color = "blue"
            elif "[부정" in cat_name: color = "red"
                
            children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat_name}, "annotations": {"bold": True, "color": color}}]}})
            for line in cat.get('summary', []):
                children_blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
            
            children_blocks.append({"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}})
            
        children_blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": " "}}]}})

    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    for i in range(0, len(children_blocks), 100):
        chunk = children_blocks[i:i+100]
        patch_res = requests.patch(append_url, headers=headers, data=json.dumps({"children": chunk}))
        if patch_res.status_code != 200:
            return page_id, f"블록 업로드 중 일부 실패: {patch_res.text}"
        time.sleep(0.5) 
        
    return page_id, None


# ==========================================
# 🚀 7. 스트림릿 웹 앱 메인 UI 구축
# ==========================================
def main():
    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 게임의 사용자 리뷰를 분석하여 주목할만한 포인트를 노션으로 자동 추출합니다.")
    st.divider()

    # --- 상태 관리(Session State) 초기화 ---
    if "step" not in st.session_state:
        st.session_state.step = 0  # 0: 입력창, 1: 피드백 창, 2: 완료 창
        st.session_state.page_id = None
        st.session_state.app_id = None
        st.session_state.game_name = None
        st.session_state.reviews_all = None
        st.session_state.reviews_recent = None
        st.session_state.store_stats = None

    # [STEP 0] 데이터 입력 및 분석 시작
    if st.session_state.step == 0:
        game_input = st.text_input("👉 분석할 게임의 영문명 또는 App ID를 입력하세요 (예: 3564740)")
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            if not game_input:
                st.warning("게임을 입력해주세요!")
                return
            
            with st.status("스팀 데이터를 탈곡하고 있습니다... 🌾", expanded=True) as status:
                st.write("🔍 스팀 상점 데이터 검색 중...")
                app_id, game_name, release_date = get_steam_game_info(game_input)
                if not app_id:
                    status.update(label="검색 실패", state="error")
                    st.error("게임을 찾을 수 없습니다. 영문명이나 App ID를 확인해주세요.")
                    return
                
                st.session_state.app_id = app_id
                st.session_state.game_name = game_name

                st.write("📥 스팀 글로벌 리뷰 데이터 수집 중...")
                reviews_all, reviews_recent, store_stats = fetch_steam_reviews(app_id)
                st.session_state.reviews_all = reviews_all
                st.session_state.reviews_recent = reviews_recent
                st.session_state.store_stats = store_stats

                st.write("🧠 AI가 올타임 & 최근 30일 여론을 분석 중입니다... (약 20초 소요)")
                insights, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats)
                if err:
                    status.update(label="AI 분석 실패", state="error")
                    st.error(f"AI 분석 중 에러가 발생했습니다: {err}")
                    return

                st.write("📝 노션 리포트 초안 생성 중...")
                page_id, err_notion = upload_to_notion(app_id, game_name, store_stats, insights)
                if not page_id:
                    status.update(label="노션 업로드 실패", state="error")
                    st.error(f"노션 업로드 중 에러가 발생했습니다: {err_notion}")
                    return

                st.session_state.page_id = page_id
                st.session_state.step = 1
                status.update(label="✅ 리포트 초안 작성 완료!", state="complete")
            st.rerun()

    # [STEP 1] 노션 확인 및 피드백 수정
    elif st.session_state.step == 1:
        st.success("✅ 노션 리포트 초안이 성공적으로 생성되었습니다!")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        ### 👀 생성된 리포트 확인하기
        **[👉 여기를 클릭하여 노션 리포트 초안 보기]({page_url})**
        """)
        st.info("리포트 내용을 확인하신 후, 마음에 드시면 '최종 승인'을 누르시고, 수정이 필요하다면 아래에 피드백을 입력해주세요.")

        st.divider()
        st.subheader("🛠️ 리포트 추가 피드백")
        feedback = st.text_area("AI에게 반영할 추가 피드백을 적어주세요 (예: 한국어 최적화 불만 부분을 더 구체적으로 써줘)")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🚀 피드백 반영하여 재작성", use_container_width=True):
                if not feedback.strip():
                    st.warning("피드백 내용을 입력해주세요.")
                else:
                    with st.status("피드백을 반영하여 다시 탈곡 중입니다... 🌾", expanded=True) as status:
                        st.write("🗑️ 기존 노션 초안 페이지 삭제 중...")
                        delete_notion_page(st.session_state.page_id)

                        st.write("🧠 AI가 피드백을 반영하여 재분석 중입니다...")
                        insights, err = analyze_with_gemini(
                            st.session_state.game_name, 
                            st.session_state.reviews_all, 
                            st.session_state.reviews_recent, 
                            st.session_state.store_stats, 
                            feedback
                        )
                        if err:
                            status.update(label="AI 분석 실패", state="error")
                            st.error(f"AI 분석 중 에러가 발생했습니다: {err}")
                            st.stop()

                        st.write("📝 수정된 노션 리포트 업로드 중...")
                        new_page_id, err_notion = upload_to_notion(
                            st.session_state.app_id, 
                            st.session_state.game_name, 
                            st.session_state.store_stats, 
                            insights
                        )
                        st.session_state.page_id = new_page_id
                        status.update(label="✅ 재작성 완료!", state="complete")
                    st.rerun()

        with col2:
            if st.button("✅ 리포트 최종 승인 (완료)", type="primary", use_container_width=True):
                st.session_state.step = 2
                st.rerun()

    # [STEP 2] 완료 화면
    elif st.session_state.step == 2:
        st.balloons()
        st.success("🎉 최종 리포트 작성이 완벽하게 끝났습니다! 수고하셨습니다.")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        ### 📄 완성된 최종 리포트
        **[👉 최종 노션 리포트 보러 가기]({page_url})**
        """)
        
        st.divider()
        if st.button("🔄 새로운 게임 분석하기"):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()