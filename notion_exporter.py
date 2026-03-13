# notion_exporter.py
import requests
import json
import time
from datetime import datetime
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
    return [{"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 리뷰 추출 기준 (클릭해서 펼치기)"}, "annotations": {"color": "gray", "bold": True}}], "children": [{"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🤖"}, "color": "blue_background", "rich_text": [{"text": {"content": f"[{APP_VERSION}] 스팀 사용자 리뷰 분석기\n", "link": None}, "annotations": {"bold": True, "color": "blue"}}, {"text": {"content": "해당 봇은 글로벌 유저 민심을 객관적으로 분석합니다.\n"}}, {"text": {"content": f"👉 {game_name} 스팀 상점 바로가기", "link": {"url": f"https://store.steampowered.com/app/{app_id}/"}}, "annotations": {"bold": True, "color": "blue", "underline": True}}]}}]}}, {"object": "block", "type": "divider", "divider": {}}]

def get_ai_one_liner_block(ai_data):
    return [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI의 한줄평"}}]}}, {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞"}, "annotations": {"color": "blue"}}]}}, {"object": "block", "type": "divider", "divider": {}}]

def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    return [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}}, {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},{"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}]}}, {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": f"💡 왜 '{recent_label}' 기준으로 분석했나요?"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": smart_reason}}]}}]}}, {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}}, {"object": "block", "type": "divider", "divider": {}}]

def get_global_summary_block(ai_data, recent_label):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}}, {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 [전체 누적 평가 주요 여론]"}, "annotations": {"color": "blue", "bold": True}}]}}]
    for line in ai_data.get('final_summary_all', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🔥 [{recent_label} 주요 여론]"}, "annotations": {"color": "red", "bold": True}}]}})
    for line in ai_data.get('final_summary_recent', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_playtime_analysis_block(ai_data):
    playtime_data = ai_data.get('playtime_analysis', {})
    if not playtime_data: return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "⏱️ 플레이타임별 주요 민심 교차 분석"}}]}}]
    comparison_insights = playtime_data.get('comparison_insights', [])
    if comparison_insights:
        list_items = [{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}} for line in comparison_insights if isinstance(line, str) and line.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚖️"}, "color": "gray_background", "rich_text": [{"text": {"content": "📊 핵심 교차 체크포인트"}, "annotations": {"bold": True, "color": "gray"}}], "children": list_items}})
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('newbie_title', '🌱 뉴비 여론')}, "annotations": {"color": "green", "bold": True}}]}})
    for line in playtime_data.get('newbie_summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('core_title', '💀 코어 여론')}, "annotations": {"color": "purple", "bold": True}}]}})
    for line in playtime_data.get('core_summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
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
        for line in cat.get('summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_language_ratio_block(store_stats):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌐 전 세계 누적 리뷰 작성 언어 비중"}}]}}, {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"총 누적 리뷰 수: {store_stats['all_total']:,}개"}, "annotations": {"bold": True, "color": "gray"}}]}}]
    
    # 💡 [버그 픽스] 표 데이터 구조 정상화 완료!
    table_rows = [
        {"type": "table_row", "table_row": {"cells": [
            [{"text": {"content": "순위"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "언어"}, "annotations": {"bold": True, "color": "gray"}}], 
            [{"text": {"content": "리뷰 수"}, "annotations": {"bold": True, "color": "gray"}}], 
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
        
    blocks.append({"object": "block", "type": "table", "table": {"table_width": 4, "has_column_header": True, "children": table_rows}})
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
            for line in cat.get('summary', []): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
            blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👀 실제 유저 평가 원문 보기"}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}}]}})
    return blocks

def upload_to_notion(app_id, game_name, store_stats, ai_data, recent_label, smart_reason, news_data):
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}
    page_title = f"[{datetime.now().strftime('%Y-%m-%d')}] {game_name} 평가 요약"
    create_data = {"parent": {"database_id": NOTION_DATABASE_ID}, "properties": {"이름": {"title": [{"text": {"content": page_title}}]}}}
    res = requests.post("https://api.notion.com/v1/pages", headers=headers, data=json.dumps(create_data))
    res.raise_for_status()
    page_id = res.json()['id']
    
    children_blocks = []
    for section in NOTION_SECTION_ORDER:
        if section == "bot_info": children_blocks.extend(get_bot_info_block(game_name, app_id))
        elif section == "ai_one_liner": children_blocks.extend(get_ai_one_liner_block(ai_data))
        elif section == "steam_sentiment": children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
        elif section == "global_summary": children_blocks.extend(get_global_summary_block(ai_data, recent_label))
        elif section == "playtime_analysis": children_blocks.extend(get_playtime_analysis_block(ai_data))
        elif section == "ai_issue_pick": children_blocks.extend(get_ai_issue_pick_block(ai_data))
        elif section == "news_summary": children_blocks.extend(get_news_summary_block(news_data, ai_data))
        elif section == "category_summary": children_blocks.extend(get_category_summary_block(ai_data))
        elif section == "language_ratio": children_blocks.extend(get_language_ratio_block(store_stats))
        elif section == "country_analysis": children_blocks.extend(get_country_analysis_block(ai_data))
        
    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    for i in range(0, len(children_blocks), 100):
        # 💡 [버그 픽스] 블록 추가 중 에러가 발생하면 무시하지 않고 바로 알려주도록 변경!
        patch_res = requests.patch(append_url, headers=headers, data=json.dumps({"children": children_blocks[i:i+100]}))
        patch_res.raise_for_status() 
        time.sleep(0.5)
        
    return page_id
