import requests
import json
import time
from datetime import datetime, timedelta, timezone
from config import NOTION_TOKEN, NOTION_DATABASE_ID, APP_VERSION, NOTION_SECTION_ORDER
from steam_api import get_lang_name

def delete_notion_page(page_id):
    url = f"https://api.notion.com/v1/pages/{page_id}"
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Notion-Version": "2022-06-28"}
    res = requests.patch(url, headers=headers, json={"archived": True})
    res.raise_for_status()

def format_sentiment_line(line):
    if line.startswith("[긍정]"):
        return [{"text": {"content": "[긍정] "}, "annotations": {"color": "blue", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    elif line.startswith("[부정]"):
        return [{"text": {"content": "[부정] "}, "annotations": {"color": "red", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    return [{"text": {"content": line}}]

def get_bot_info_block(game_name, app_id):
    return [
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 리뷰 추출 기준 (클릭해서 펼치기)"}, "annotations": {"color": "gray", "bold": True}}], "children": [
            {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🤖"}, "color": "blue_background", "rich_text": [{"text": {"content": f"[{APP_VERSION}] 스팀 사용자 리뷰 분석기\n", "link": None}, "annotations": {"bold": True, "color": "blue"}}, {"text": {"content": "해당 봇은 글로벌 유저 민심을 객관적으로 분석합니다.\n"}}, {"text": {"content": f"👉 {game_name} 스팀 상점 바로가기", "link": {"url": f"https://store.steampowered.com/app/{app_id}/"}}, "annotations": {"bold": True, "color": "blue", "underline": True}}]}},
            {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚠️"}, "color": "yellow_background", "rich_text": [{"text": {"content": "평점 지표 3분할 안내\n", "link": None}, "annotations": {"bold": True}}, {"text": {"content": "리포트 내 평점은 3가지로 나뉘어 제공됩니다. 스팀 공식 평점은 '스팀 상점을 통해 직접 라이선스를 획득한 유저'의 평가만 점수에 반영합니다. 하지만 전체 누적 평점 및 최근 동향은 외부 키 등록 및 무료 플레이어 등 "}}, {"text": {"content": "모든 유저(purchase_type=all)", "link": None}, "annotations": {"bold": True, "color": "red"}}, {"text": {"content": "의 리뷰를 100% 수집하므로, 탈곡기 데이터가 전체 유저의 더 포괄적인 민심을 반영합니다."}}]}}
        ]}}, 
        {"object": "block", "type": "divider", "divider": {}}
    ]

def get_ai_one_liner_block(ai_data, game_name, release_date):
    return [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI의 한줄평"}}]}}, 
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞"}, "annotations": {"color": "blue"}}]}}, 
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"{release_date} 스팀에 출시된 [{game_name}]에 대한 AI의 한줄평 입니다."}, "annotations": {"color": "gray"}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]

def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}}, 
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
            {"text": {"content": f"🛑 스팀 공식 평점: {store_stats.get('official_desc', '평가 없음')}"}},
            {"text": {"content": "\n"}},
            {"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)"}},
            {"text": {"content": "\n"}},
            {"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}
        ]}}, 
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": f"💡 왜 '{recent_label}' 기준으로 분석했나요?"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": smart_reason}}]}}]}}, 
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 각 평점 지표별 산출 기준 안내"}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "스팀 공식 평점: 스팀 상점을 통해 직접 라이선스를 획득한 유저만 반영된 점수입니다."}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "전체 누적 평점: 외부 키(Key) 등록 및 무료 플레이어 등 모든 유저를 100% 포함한 포괄적 민심입니다."}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "출시 초기 / 최근 동향: 출시일에 따라 동적으로 설정된 기간 내에 실제 작성된 리뷰 표본을 타임스탬프 기준으로 정밀 필터링하여 집계합니다."}}]}}
        ]}},
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}}, 
        {"object": "block", "type": "divider", "divider": {}}
    ]
    return blocks

def get_global_summary_block(ai_data, recent_label):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}}, {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 [전체 누적 평가 주요 여론]"}, "annotations": {"bold": True}}]}}]
    for line in ai_data.get('final_summary_all', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🔥 [{recent_label} 주요 여론]"}, "annotations": {"bold": True}}]}})
    for line in ai_data.get('final_summary_recent', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_playtime_analysis_block(ai_data, stats):
    playtime_data = ai_data.get('playtime_analysis', {})
    if not playtime_data: return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "⏱️ 플레이타임별 주요 민심 교차 분석"}}]}}]
    
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 플레이타임별 표본 수집 및 분석 방식 안내"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "수집된 전체 리뷰 표본을 플레이타임 순으로 정렬한 뒤, 중간값의 노이즈를 배제하기 위해 하위 25%를 '뉴비 여론', 상위 25%를 '코어 여론'으로 명확히 분리하여 두 그룹 간의 시각차를 도출합니다."}}]}}]}})

    comparison_insights = playtime_data.get('comparison_insights', [])
    if comparison_insights:
        list_items = [{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}} for line in comparison_insights if isinstance(line, str) and line.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚖️"}, "color": "gray_background", "rich_text": [{"text": {"content": "📊 핵심 교차 체크포인트"}, "annotations": {"bold": True, "color": "gray"}}], "children": list_items}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('newbie_title', '🌱 뉴비 여론')}, "annotations": {"color": "green", "bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"ℹ️ 표본: {stats.get('newbie_total', 0)}개 | 평균 여론: {stats.get('newbie_desc', '평가 없음')}"}, "annotations": {"color": "gray"}}]}})
    for line in playtime_data.get('newbie_summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('core_title', '💀 코어 여론')}, "annotations": {"color": "purple", "bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"ℹ️ 표본: {stats.get('core_total', 0)}개 | 평균 여론: {stats.get('core_desc', '평가 없음')}"}, "annotations": {"color": "gray"}}]}})
    for line in playtime_data.get('core_summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_ai_issue_pick_block(ai_data):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🚨 [AI 이슈 픽] 체크포인트"}}]}}]
    for issue in ai_data.get('ai_issue_pick', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": issue}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_news_summary_block(news_data, ai_data):
    if not news_data or not news_data[0]: return []
    news_title, _, news_url, news_date = news_data
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📢 최신 게임 공지/패치노트"}}]}}, {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🔗"}, "color": "gray_background", "rich_text": [{"text": {"content": f"[{news_date}] ", "link": None}, "annotations": {"bold": True, "color": "gray"}}, {"text": {"content": news_title, "link": {"url": news_url}}, "annotations": {"bold": True, "underline": True}}]}}]
    news_summary_data = ai_data.get('news_summary', [])
    if news_summary_data:
        for line in news_summary_data: blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_category_summary_block(ai_data):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📁 카테고리별 종합 평가"}}]}}]
    for cat in ai_data.get('global_category_summary', []):
        color = "blue" if "[긍정" in cat.get('category', '') else ("red" if "[부정" in cat.get('category', '') else "default")
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": cat.get('category', '')}, "annotations": {"color": color}}]}})
        for line in cat.get('summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def _create_notion_table(table_data_list, limit=None, is_region=False):
    rows = [
        {"type": "table_row", "table_row": {"cells": [
            [{"text": {"content": "순위"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "권역" if is_region else "언어"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "리뷰 수"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "비중"}, "annotations": {"bold": True, "color": "gray"}}],
            [{"text": {"content": "👍 긍정 비율"}, "annotations": {"bold": True, "color": "blue"}}],
            [{"text": {"content": "👎 부정 비율"}, "annotations": {"bold": True, "color": "red"}}],
            [{"text": {"content": "📊 평가 결과"}, "annotations": {"bold": True, "color": "purple"}}]
        ]}}
    ]
    
    target_list = table_data_list[:limit] if limit else table_data_list
    for r in target_list:
        eval_val = str(r['eval'])
        eval_color = "blue" if "긍정적" in eval_val else ("red" if "부정적" in eval_val else "gray")
        name_val = str(r['region']) if is_region else str(r['lang_with_flag'])
        
        rows.append({"type": "table_row", "table_row": {"cells": [
            [{"text": {"content": str(r['rank'])}}], 
            [{"text": {"content": name_val}}], 
            [{"text": {"content": f"{r['count']:,}개"}}], 
            [{"text": {"content": str(r['ratio'])}}],
            [{"text": {"content": str(r['pos_ratio'])}, "annotations": {"color": "blue"}}],
            [{"text": {"content": str(r['neg_ratio'])}, "annotations": {"color": "red"}}],
            [{"text": {"content": eval_val}, "annotations": {"color": eval_color, "bold": True}}]
        ]}})
        
    return {"object": "block", "type": "table", "table": {"table_width": 7, "has_column_header": True, "children": rows}}

def get_language_ratio_block(store_stats):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌐 전 세계 언어별 여론 지표"}}]}}]
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🗺️ 주요 권역별 누적 리뷰 비중"}}]}})
    
    blocks.append({
        "object": "block", "type": "toggle", "toggle": {
            "rich_text": [{"text": {"content": "ℹ️ 각 권역별 포함 국가(언어) 안내"}, "annotations": {"color": "gray"}}],
            "children": [
                {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "🌏 아시아: 한국어, 중국어(간/번체), 일본어, 태국어, 베트남어, 인도네시아어"}}]}},
                {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "🌍 영미/유럽권: 영어, 프랑스어, 독일어, 스페인어, 이탈리아어 등 유럽 주요 언어"}}]}},
                {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "🧊 CIS (러시아 등): 러시아어, 우크라이나어"}}]}},
                {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "💃 중남미: 스페인어(중남미), 포르투갈어(브라질)"}}]}},
                {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "🕌 중동/기타: 튀르키예어, 아랍어 등"}}]}}
            ]
        }
    })
    
    blocks.append(_create_notion_table(store_stats['table_data_region'], is_region=True))
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🥇 언어별 누적 리뷰 비중 TOP 10"}}]}})
    blocks.append(_create_notion_table(store_stats['table_data_all'], limit=10))
    
    blocks.append({"object": "block", "type": "toggle", "toggle": {
        "rich_text": [{"text": {"content": "👀 전 세계 누적 리뷰 언어별 비중 (전체 보기)"}}],
        "children": [_create_notion_table(store_stats['table_data_all'])]
    }})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10"}}]}})
    
    blocks.append({
        "object": "block", "type": "toggle", "toggle": {
            "rich_text": [{"text": {"content": "ℹ️ 30일 데이터 집계 기준 안내"}, "annotations": {"color": "gray"}}],
            "children": [
                {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "집계일 기준 최근 30일 이내에 실제 작성된 리뷰 표본만을 타임스탬프 기준으로 정밀 추출하여 산출한 데이터입니다."}}]}}
            ]
        }
    })
    
    if store_stats['days_since_release'] < 30:
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "ℹ️"}, "color": "gray_background", "rich_text": [{"text": {"content": "출시일로부터 30일 이후부터 지원하는 표입니다. (현재 데이터 부족)"}}]}})
    else:
        blocks.append(_create_notion_table(store_stats['table_data_30'], limit=10))
        blocks.append({"object": "block", "type": "toggle", "toggle": {
            "rich_text": [{"text": {"content": "👀 최근 30일 누적 리뷰 언어별 비중 (전체보기)"}}],
            "children": [_create_notion_table(store_stats['table_data_30'])]
        }})
        
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_country_analysis_block(ai_data):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 리뷰 작성 언어별 세부 평가 분석 (TOP 3 + 한국)"}}]}}]
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "가장 많은 평가가 작성된 언어 상위 3개와 한국어 리뷰의 주요 평가에 대해 정리합니다."}, "annotations": {"color": "gray"}}]}})
    for country in ai_data.get('country_analysis', []):
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}, "annotations": {"color": "purple", "bold": True}}]}})
        for cat in country.get('categories', []):
            color = "blue" if "[긍정" in cat.get('name', '') else ("red" if "[부정" in cat.get('name', '') else "default")
            blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat.get('name', '')}, "annotations": {"bold": True, "color": color}}]}})
            for line in cat.get('summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
            blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👀 실제 유저 평가 원문 보기"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}}]}})
    return blocks

def upload_to_notion(app_id, game_name, release_date, store_stats, ai_data, recent_label, smart_reason, news_data):
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)
    iso_timestamp = now_kst.strftime('%Y-%m-%dT%H:%M:%S+09:00')
    page_title = f"{game_name} 평가 요약"
    create_data = {
        "parent": {"database_id": NOTION_DATABASE_ID}, 
        "properties": {
            "이름": {"title": [{"text": {"content": page_title}}]},
            "추출 시점": {"date": {"start": iso_timestamp}},
            "탈곡기 버전": {"rich_text": [{"text": {"content": APP_VERSION}}]}
        }
    }
    try:
        res = requests.post("https://api.notion.com/v1/pages", headers=headers, data=json.dumps(create_data))
        res.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise Exception(f"노션 DB 연동 실패 (컬럼명/타입 불일치 의심): {e.response.text}")
    
    page_id = res.json()['id']
    children_blocks = []
    
    for section in NOTION_SECTION_ORDER:
        if section == "bot_info": children_blocks.extend(get_bot_info_block(game_name, app_id))
        elif section == "ai_one_liner": children_blocks.extend(get_ai_one_liner_block(ai_data, game_name, release_date))
        elif section == "steam_sentiment": children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
        elif section == "global_summary": children_blocks.extend(get_global_summary_block(ai_data, recent_label))
        elif section == "playtime_analysis": children_blocks.extend(get_playtime_analysis_block(ai_data, store_stats))
        elif section == "ai_issue_pick": children_blocks.extend(get_ai_issue_pick_block(ai_data))
        elif section == "news_summary": children_blocks.extend(get_news_summary_block(news_data, ai_data))
        elif section == "category_summary": children_blocks.extend(get_category_summary_block(ai_data))
        elif section == "language_ratio": children_blocks.extend(get_language_ratio_block(store_stats))
        elif section == "country_analysis": children_blocks.extend(get_country_analysis_block(ai_data))
        
    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    
    # 💡 [핵심 픽스] 노션 API의 '3단계 깊이 중첩(Nesting) 제한' 우회 로직
    # 토글(1) -> 표(2) -> 행(3) 은 한 번에 추가 불가. 표를 밖으로 빼서 토글 ID 발급 후 개별 주입!
    for i in range(0, len(children_blocks), 100):
        chunk = children_blocks[i:i+100]
        deferred_tables = []
        
        for idx, block in enumerate(chunk):
            if block.get("type") == "toggle" and "children" in block["toggle"]:
                clean_children = []
                for child in block["toggle"]["children"]:
                    # 표(Table) 발견 시 토글에서 분리하여 임시 보관
                    if child.get("type") == "table":
                        deferred_tables.append((idx, child))
                    else:
                        clean_children.append(child)
                
                if clean_children:
                    block["toggle"]["children"] = clean_children
                else:
                    # 빈 토글 껍데기만 노션에 먼저 전송
                    del block["toggle"]["children"]

        try:
            # 1. 100개 블록(빈 토글 포함) 1차 배치 전송
            patch_res = requests.patch(append_url, headers=headers, data=json.dumps({"children": chunk}))
            patch_res.raise_for_status() 
            created_blocks = patch_res.json().get('results', [])
            
            # 2. 미리 빼두었던 표(Table)를 생성된 토글의 ID를 찾아 2차로 밀어넣기
            for idx, table_block in deferred_tables:
                if idx < len(created_blocks):
                    toggle_id = created_blocks[idx]['id']
                    t_url = f"https://api.notion.com/v1/blocks/{toggle_id}/children"
                    t_res = requests.patch(t_url, headers=headers, data=json.dumps({"children": [table_block]}))
                    t_res.raise_for_status()
                    
        except requests.exceptions.HTTPError as e:
            raise Exception(f"노션 블록 추가 실패: {e.response.text}")
        time.sleep(0.5)
        
    return page_id
