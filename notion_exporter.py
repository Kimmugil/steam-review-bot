import requests
import json
import time
from datetime import datetime, timedelta, timezone
from config import NOTION_TOKEN, NOTION_DATABASE_ID, APP_VERSION
import ui_texts as ui  # 💡 [핵심] 모듈화된 텍스트 불러오기

def sort_sentiments(lines):
    if not isinstance(lines, list): return []
    def get_sort_key(line):
        if "[긍정]" in line: return 0
        elif "[부정]" in line: return 1
        return 2
    return sorted(lines, key=get_sort_key)

def format_sentiment_line(line):
    if line.startswith("[긍정]"): return [{"text": {"content": "[긍정] "}, "annotations": {"color": "blue", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    elif line.startswith("[부정]"): return [{"text": {"content": "[부정] "}, "annotations": {"color": "red", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    return [{"text": {"content": line}}]

def get_bot_info_block(game_name, app_id):
    return [{"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 봇 안내 및 추출 기준", "link": None}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "자동화된 글로벌 유저 민심 분석 봇입니다."}}]}}]}}]

def get_ai_one_liner_block(ai_data, game_name, release_date):
    return [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🤖 AI 한줄평"}}]}}, 
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "gray_background", "rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞", "link": None}, "annotations": {"bold": True, "color": "blue"}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"{release_date} 스팀에 출시된 [{game_name}]에 대한 AI 분석 결과입니다."}, "annotations": {"color": "gray"}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]

def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "📊 스팀 민심 온도계"}}]}}, 
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 각 평점 지표별 산출 기준 안내"}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"스팀 공식 평점: {ui.TEXTS['tooltip_official']}"}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"전체 누적 평점: {ui.TEXTS['tooltip_all']}"}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"최근 동향: {smart_reason}"}}]}}
        ]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
            {"text": {"content": f"🛑 스팀 공식 평점: {store_stats.get('official_desc', '평가 없음')}\n"}},
            {"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},
            {"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}
        ]}},
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]
    return blocks

def get_global_summary_block(ai_data, recent_label, smart_reason):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🎯 전 국가 망라 최종 요약"}}]}},
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "📈 전체 누적 주요 여론"}, "annotations": {"bold": True}}]}}
    ]
    for line in sort_sentiments(ai_data.get('final_summary_all', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🔥 {recent_label} 주요 여론"}, "annotations": {"bold": True}}]}})
    # 💡 [명세서 반영] 노션에도 요약 파트에 집계 기간 명시
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"📅 집계 기간: {smart_reason}"}, "annotations": {"color": "gray"}}]}})
    
    for line in sort_sentiments(ai_data.get('final_summary_recent', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_playtime_analysis_block(ai_data, stats):
    playtime_data = ai_data.get('playtime_analysis', {})
    if not playtime_data: return []
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "⏱️ 플레이타임별 민심 교차 분석"}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 플레이타임 산출 기준 안내"}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['tooltip_playtime']}}]}}
        ]}}
    ]
    comparison_insights = playtime_data.get('comparison_insights', [])
    if comparison_insights:
        list_items = [{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}} for line in comparison_insights if isinstance(line, str) and line.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚖️"}, "color": "yellow_background", "rich_text": [{"text": {"content": "핵심 교차 인사이트"}, "annotations": {"bold": True}}], "children": list_items}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('newbie_title', '🌱 뉴비 여론')}, "annotations": {"color": "green", "bold": True}}]}})
    for line in sort_sentiments(playtime_data.get('newbie_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('normal_title', '🚶 일반 여론')}, "annotations": {"color": "blue", "bold": True}}]}})
    for line in sort_sentiments(playtime_data.get('normal_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})

    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('core_title', '💀 코어 여론')}, "annotations": {"color": "purple", "bold": True}}]}})
    for line in sort_sentiments(playtime_data.get('core_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_region_analysis_block(ai_data):
    reg_data = ai_data.get('region_analysis', {})
    if not reg_data: return []
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🗺️ 권역별 세부 평가 분석"}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "ℹ️ 권역 맵핑 기준 안내"}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['tooltip_region']}}]}}
        ]}}
    ]
    
    if reg_data.get('divergence_insight'):
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "purple_background", "rich_text": [{"text": {"content": "다이버전스(권역별 여론 차이) 인사이트\n", "link": None}, "annotations": {"bold": True}}, {"text": {"content": reg_data['divergence_insight']}}]}})
        
    for reg in reg_data.get('regions', []):
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"📍 {reg.get('region')} (동향: {reg.get('trend')})"}}]}})
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"🔑 주요 키워드: {', '.join(reg.get('keywords', []))}"}, "annotations": {"color": "gray"}}]}})
        for cat in reg.get('categories', []):
            color = "blue" if "[긍정" in cat.get('name', '') else ("red" if "[부정" in cat.get('name', '') else "default")
            blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat.get('name', '')}, "annotations": {"bold": True, "color": color}}]}})
            for line in sort_sentiments(cat.get('summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_country_analysis_block(ai_data):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌍 리뷰 작성 언어별 분석"}}]}}]
    for country in ai_data.get('country_analysis', []):
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": f"🚩 {country.get('language', '')}"}}]}})
        for cat in country.get('categories', []):
            for line in sort_sentiments(cat.get('summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
            if cat.get('quote'): blocks.append({"object": "block", "type": "quote", "quote": {"rich_text": [{"text": {"content": cat.get('quote', '')}, "annotations": {"color": "gray"}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def _create_notion_table(table_data_list, limit=None, is_region=False):
    rows = [{"type": "table_row", "table_row": {"cells": [[{"text": {"content": "순위"}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": "권역" if is_region else "언어"}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": "리뷰 수"}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": "비중"}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": "👍 긍정 비율"}, "annotations": {"bold": True, "color": "blue"}}], [{"text": {"content": "👎 부정 비율"}, "annotations": {"bold": True, "color": "red"}}], [{"text": {"content": "📊 평가 결과"}, "annotations": {"bold": True, "color": "purple"}}]]}}]
    
    target_list = table_data_list[:limit] if limit else table_data_list
    for r in target_list:
        eval_val = str(r['eval'])
        eval_color = "blue" if "긍정적" in eval_val else ("red" if "부정적" in eval_val else "gray")
        name_val = str(r['region']) if is_region else str(r['lang_with_flag'])
        rows.append({"type": "table_row", "table_row": {"cells": [[{"text": {"content": str(r['rank'])}}], [{"text": {"content": name_val}}], [{"text": {"content": f"{r['count']:,}개"}}], [{"text": {"content": str(r['ratio'])}}], [{"text": {"content": str(r['pos_ratio'])}, "annotations": {"color": "blue"}}], [{"text": {"content": str(r['neg_ratio'])}, "annotations": {"color": "red"}}], [{"text": {"content": eval_val}, "annotations": {"color": eval_color, "bold": True}}]]}})
    return {"object": "block", "type": "table", "table": {"table_width": 7, "has_column_header": True, "children": rows}}

# 💡 [명세서 반영] 누락됐던 데이터 테이블과 언어/권역 안내 문구 복구!
def get_language_ratio_block(store_stats, smart_reason):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "🌐 글로벌 언어 및 권역 통계표"}}]}}]
    
    blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚠️"}, "color": "yellow_background", "rich_text": [{"text": {"content": ui.TEXTS['disclaimer_language'].replace("💡 ", "")}}]}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🗺️ 주요 권역별 누적 리뷰 비중"}}]}})
    blocks.append(_create_notion_table(store_stats['table_data_region'], is_region=True))
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🥇 언어별 누적 리뷰 비중 TOP 10"}}]}})
    blocks.append(_create_notion_table(store_stats['table_data_all'], limit=10))
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👀 언어별 누적 리뷰 비중 (전체 보기)"}}], "children": [_create_notion_table(store_stats['table_data_all'])]}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10"}}]}})
    if store_stats['days_since_release'] < 30:
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "ℹ️ 출시일로부터 30일 이후부터 지원하는 표입니다."}, "annotations": {"color": "gray"}}]}})
    else:
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": f"📅 표 집계 기간: {smart_reason}"}, "annotations": {"color": "gray"}}]}})
        blocks.append(_create_notion_table(store_stats['table_data_30'], limit=10))
        blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": "👀 최근 30일 누적 리뷰 비중 (전체보기)"}}], "children": [_create_notion_table(store_stats['table_data_30'])]}})
        
    blocks.append({"object": "block", "type": "divider", "divider": {}})
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
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)
    iso_timestamp = now_kst.strftime('%Y-%m-%dT%H:%M:%S+09:00')

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
    except Exception as e:
        print(f"Error creating Notion page: {e}")
        return None
        
    page_id = res.json()['id']
    children_blocks = []
    
    children_blocks.extend(get_bot_info_block(game_name, app_id))
    children_blocks.extend(get_ai_one_liner_block(ai_data, game_name, release_date))
    children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
    children_blocks.extend(get_global_summary_block(ai_data, recent_label, smart_reason))
    children_blocks.extend(get_playtime_analysis_block(ai_data, store_stats))
    children_blocks.extend(get_region_analysis_block(ai_data))
    children_blocks.extend(get_country_analysis_block(ai_data))
    children_blocks.extend(get_language_ratio_block(store_stats, smart_reason))  # 💡 표 블록 복구!
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

        try:
            patch_res = requests.patch(append_url, headers=headers, data=json.dumps({"children": chunk}))
            patch_res.raise_for_status()
            created_blocks = patch_res.json().get('results', [])
            
            for idx, table_block in deferred_tables:
                if idx < len(created_blocks):
                    toggle_id = created_blocks[idx]['id']
                    requests.patch(f"https://api.notion.com/v1/blocks/{toggle_id}/children", headers=headers, data=json.dumps({"children": [table_block]}))
                    
        except requests.exceptions.HTTPError as e:
            print(f"노션 블록 추가 실패: {e.response.text}")
            pass
        time.sleep(0.5)
        
    return page_id
