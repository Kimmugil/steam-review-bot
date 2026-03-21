import requests
import json
import time
from datetime import datetime, timedelta, timezone
from config import NOTION_TOKEN, NOTION_DATABASE_ID, APP_VERSION, NOTION_SECTION_ORDER
from steam_api import get_lang_name

def format_sentiment_line(line):
    if line.startswith("[긍정]"): return [{"text": {"content": "[긍정] "}, "annotations": {"color": "blue", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    elif line.startswith("[부정]"): return [{"text": {"content": "[부정] "}, "annotations": {"color": "red", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    return [{"text": {"content": line}}]

def get_bot_info_block(game_name, app_id):
    return [{"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 추출 기준", "link": None}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "자동화된 분석 봇입니다."}}]}}]}}]

def get_ai_one_liner_block(ai_data, game_name, release_date):
    return [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI 한줄평"}}]}}, 
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "gray_background", "rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞", "link": None}, "annotations": {"bold": True, "color": "blue"}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]

# 💡 [업데이트 8번] 노션 토스 스타일 적용! '핵심 요약(Callout)'을 토글 밖에 빼고 상세 내용을 접음
def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}}, 
        # 밖에 빼놓는 핵심 요약 (Callout)
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}},
        # 상세 수치 데이터는 토글 안으로
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👉 세부 평점 수치 보기"}}], "children": [
            {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
                {"text": {"content": f"🛑 스팀 공식 평점: {store_stats.get('official_desc', '평가 없음')}\n"}},
                {"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},
                {"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}
            ]}}
        ]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]
    return blocks

def get_global_summary_block(ai_data, recent_label):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👉 여론 요약 펼쳐보기"}}], "children": [
            {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 전체 누적 주요 여론"}, "annotations": {"bold": True}}]}}
        ]}}
    ]
    
    # Toggle block children configuration
    toggle_children = blocks[1]["toggle"]["children"]
    for line in ai_data.get('final_summary_all', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🔥 {recent_label} 주요 여론"}, "annotations": {"bold": True}}]}})
    for line in ai_data.get('final_summary_recent', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_playtime_analysis_block(ai_data, stats):
    playtime_data = ai_data.get('playtime_analysis', {})
    if not playtime_data: return []
    
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "⏱️ 플레이타임별 민심 교차 분석"}}]}}]
    
    # 핵심 인사이트를 밖에 Callout으로 노출
    comparison_insights = playtime_data.get('comparison_insights', [])
    if comparison_insights:
        list_items = [{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}} for line in comparison_insights if isinstance(line, str) and line.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚖️"}, "color": "yellow_background", "rich_text": [{"text": {"content": "핵심 교차 인사이트"}, "annotations": {"bold": True}}], "children": list_items}})
    
    # 3분할 데이터는 토글 안으로
    toggle_children = []
    toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('newbie_title', '🌱 뉴비 여론')}, "annotations": {"color": "green", "bold": True}}]}})
    for line in playtime_data.get('newbie_summary', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('normal_title', '🚶 일반 여론')}, "annotations": {"color": "blue", "bold": True}}]}})
    for line in playtime_data.get('normal_summary', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})

    toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('core_title', '💀 코어 여론')}, "annotations": {"color": "purple", "bold": True}}]}})
    for line in playtime_data.get('core_summary', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👉 유저층별 상세 여론 보기"}}], "children": toggle_children}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_region_analysis_block(ai_data):
    reg_data = ai_data.get('region_analysis', {})
    if not reg_data: return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🗺️ 권역별 세부 평가 분석"}}]}}]
    
    # 다이버전스 인사이트를 밖에 Callout으로 노출
    if reg_data.get('divergence_insight'):
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "purple_background", "rich_text": [{"text": {"content": "다이버전스(권역별 여론 차이) 인사이트\n", "link": None}, "annotations": {"bold": True}}, {"text": {"content": reg_data['divergence_insight']}}]}})
        
    toggle_children = []
    for reg in reg_data.get('regions', []):
        toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"📍 {reg.get('region')} (동향: {reg.get('trend')})"}}]}})
        toggle_children.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"🔑 주요 키워드: {', '.join(reg.get('keywords', []))}"}, "annotations": {"color": "gray"}}]}})
        for cat in reg.get('categories', []):
            color = "blue" if "[긍정" in cat.get('name', '') else ("red" if "[부정" in cat.get('name', '') else "default")
            toggle_children.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat.get('name', '')}, "annotations": {"bold": True, "color": color}}]}})
            for line in cat.get('summary', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👉 권역별 상세 여론 보기"}}], "children": toggle_children}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_country_analysis_block(ai_data):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 리뷰 작성 언어별 분석"}}]}}]
    toggle_children = []
    for country in ai_data.get('country_analysis', []):
        toggle_children.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}}]}})
        for cat in country.get('categories', []):
            for line in cat.get('summary', []): toggle_children.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
            if cat.get('quote'): toggle_children.append({"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}})
            
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👉 언어별 상세 여론 보기"}}], "children": toggle_children}})
    return blocks

def get_qa_block(qa_history):
    if not qa_history: return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🙋‍♀️ 추가 문의사항 답변"}}]}}]
    for qa in qa_history:
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"Q. {qa['q']}"}, "annotations": {"bold": True, "color": "blue"}}]}})
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🤖"}, "color": "gray_background", "rich_text": [{"text": {"content": f"{qa['a']}"}}]}})
    return blocks

def upload_to_notion(app_id, game_name, release_date, store_stats, ai_data, recent_label, smart_reason, news_data, qa_history):
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}
    page_title = f"{game_name} 평가 요약"
    
    create_data = {
        "parent": {"database_id": NOTION_DATABASE_ID}, 
        "properties": {"이름": {"title": [{"text": {"content": page_title}}]}}
    }
    
    res = requests.post("https://api.notion.com/v1/pages", headers=headers, data=json.dumps(create_data))
    page_id = res.json()['id']
    children_blocks = []
    
    children_blocks.extend(get_bot_info_block(game_name, app_id))
    children_blocks.extend(get_ai_one_liner_block(ai_data, game_name, release_date))
    children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
    children_blocks.extend(get_global_summary_block(ai_data, recent_label))
    children_blocks.extend(get_playtime_analysis_block(ai_data, store_stats))
    children_blocks.extend(get_region_analysis_block(ai_data))
    children_blocks.extend(get_country_analysis_block(ai_data))
    if qa_history: children_blocks.extend(get_qa_block(qa_history))
        
    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    
    for i in range(0, len(children_blocks), 100):
        chunk = children_blocks[i:i+100]
        deferred_tables = []
        for idx, block in enumerate(chunk):
            if block.get("type") == "toggle" and "children" in block["toggle"]:
                clean_children = []
                for child in block["toggle"]["children"]:
                    if child.get("type") == "table": deferred_tables.append((idx, child))
                    else: clean_children.append(child)
                if clean_children: block["toggle"]["children"] = clean_children
                else: del block["toggle"]["children"]

        patch_res = requests.patch(append_url, headers=headers, data=json.dumps({"children": chunk}))
        created_blocks = patch_res.json().get('results', [])
        
        for idx, table_block in deferred_tables:
            if idx < len(created_blocks):
                toggle_id = created_blocks[idx]['id']
                requests.patch(f"https://api.notion.com/v1/blocks/{toggle_id}/children", headers=headers, data=json.dumps({"children": [table_block]}))
        time.sleep(0.5)
        
    return page_id
