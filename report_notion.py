import requests
import json
import time
from datetime import datetime, timedelta, timezone
from config import NOTION_TOKEN, NOTION_DATABASE_ID, APP_VERSION
import ui_texts as ui 

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

def get_bot_info_block():
    return [{"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['bot_info_title'], "link": None}, "annotations": {"color": "gray"}}], "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['bot_info_desc']}}]}}]}}]

def get_ai_one_liner_block(ai_data, game_name, release_date):
    return [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['ai_one_liner_title']}}]}}, 
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💬"}, "color": "gray_background", "rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞", "link": None}, "annotations": {"bold": True, "color": "blue"}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['ai_one_liner_desc'].format(release_date, game_name)}, "annotations": {"color": "gray"}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]

def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_metric_title']}}]}}, 
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['notion_toggle_guide']}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"스팀 공식 평점: {ui.TEXTS['tooltip_official']}"}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"전체 누적 평점: {ui.TEXTS['tooltip_all']}"}}]}},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": f"최근 동향: {smart_reason}"}}]}}
        ]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [
            {"text": {"content": f"🛑 스팀 공식 평점: {store_stats.get('official_desc', ui.TEXTS['steam_eval_none'])}\n"}},
            {"text": {"content": f"📈 전체 누적 평가: {store_stats['all_desc']} (총 {store_stats['all_total']:,}개)\n"}},
            {"text": {"content": f"🔥 {recent_label}: {store_stats['recent_desc']} (분석 표본 {store_stats['recent_total']:,}개)"}, "annotations": {"bold": True, "color": "red"}}
        ]}},
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "blue_background", "rich_text": [{"text": {"content": ai_data.get('sentiment_analysis', '')}}]}},
        {"object": "block", "type": "divider", "divider": {}}
    ]
    return blocks

def get_global_summary_block(ai_data, recent_label, smart_reason, collection_period):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_summary_title']}}]}},
        {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['notion_summary_all']}, "annotations": {"bold": True}}]}}
    ]
    for line in sort_sentiments(ai_data.get('final_summary_all', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['notion_summary_recent'].format(recent_label)}, "annotations": {"bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['date_period_info'].format(collection_period, smart_reason)}, "annotations": {"color": "gray"}}]}})
    
    for line in sort_sentiments(ai_data.get('final_summary_recent', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_category_summary_block(ai_data):
    if not ai_data.get('global_category_summary'): return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_category_summary_title'].replace("### ", "")}}]}}]
    for cat in ai_data.get('global_category_summary', []):
        cat_name = cat.get('category', '')
        color = "blue" if "[긍정" in cat_name else ("red" if "[부정" in cat_name else "default")
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": cat_name}, "annotations": {"color": color}}]}})
        for line in sort_sentiments(cat.get('summary', [])): 
            blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_ai_issue_pick_block(ai_data, smart_reason):
    if not ai_data.get('ai_issue_pick'): return []
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_issue_pick_title'].replace("### ", "")}}]}},
        # 💡 [업데이트] 이슈 픽 추출 기준(기간) 노션에도 추가 명시!
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS["issue_pick_desc"].format(smart_reason)}, "annotations": {"color": "gray"}}]}}
    ]
    for issue in ai_data.get('ai_issue_pick', []): 
        blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": issue}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_news_summary_block(news_data, ai_data):
    if not news_data or not news_data[0]: return []
    news_title, _, news_url, news_date = news_data
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_news_title'].replace("### ", "")}}]}}, 
        {"object": "block", "type": "callout", "callout": {"icon": {"emoji": "🔗"}, "color": "gray_background", "rich_text": [{"text": {"content": f"[{news_date}] ", "link": None}, "annotations": {"bold": True, "color": "gray"}}, {"text": {"content": news_title, "link": {"url": news_url}}, "annotations": {"bold": True, "underline": True}}]}}
    ]
    for line in ai_data.get('news_summary', []): 
        blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_playtime_analysis_block(ai_data, stats):
    playtime_data = ai_data.get('playtime_analysis', {})
    if not playtime_data: return []
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_playtime_title']}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['notion_toggle_playtime']}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['tooltip_playtime']}}]}}
        ]}}
    ]
    comparison_insights = playtime_data.get('comparison_insights', [])
    if comparison_insights:
        list_items = [{"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": line}}]}} for line in comparison_insights if isinstance(line, str) and line.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚖️"}, "color": "yellow_background", "rich_text": [{"text": {"content": ui.TEXTS['notion_insight_core']}, "annotations": {"bold": True}}], "children": list_items}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('newbie_title', ui.TEXTS['newbie_title_default'])}, "annotations": {"color": "green", "bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['sample_opinion'].format(stats.get('newbie_total', 0), stats.get('newbie_avg', 0), stats.get('newbie_desc', ui.TEXTS['steam_eval_none']))}, "annotations": {"color": "gray"}}]}})
    for line in sort_sentiments(playtime_data.get('newbie_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('normal_title', ui.TEXTS['normal_title_default'])}, "annotations": {"color": "blue", "bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['sample_opinion'].format(stats.get('norm_total', 0), stats.get('norm_avg', 0), stats.get('norm_desc', ui.TEXTS['steam_eval_none']))}, "annotations": {"color": "gray"}}]}})
    for line in sort_sentiments(playtime_data.get('normal_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})

    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": playtime_data.get('core_title', ui.TEXTS['core_title_default'])}, "annotations": {"color": "purple", "bold": True}}]}})
    blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['sample_opinion'].format(stats.get('core_total', 0), stats.get('core_avg', 0), stats.get('core_desc', ui.TEXTS['steam_eval_none']))}, "annotations": {"color": "gray"}}]}})
    for line in sort_sentiments(playtime_data.get('core_summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_region_analysis_block(ai_data):
    reg_data = ai_data.get('region_analysis', {})
    if not reg_data: return []
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_region_title']}}]}},
        {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['notion_toggle_region']}, "annotations": {"color": "gray"}}], "children": [
            {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['tooltip_region']}}]}}
        ]}}
    ]
    
    if reg_data.get('divergence_insight'):
        blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "💡"}, "color": "purple_background", "rich_text": [{"text": {"content": ui.TEXTS['divergence_insight'].format(reg_data['divergence_insight']).replace("**", "")}}]}})
        
    for reg in reg_data.get('regions', []):
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['region_expander'].format(reg.get('region'), reg.get('trend'))}}]}})
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['keyword_label'].format(', '.join(reg.get('keywords', [])))}, "annotations": {"color": "gray"}}]}})
        for cat in reg.get('categories', []):
            cat_name = cat.get('name', '')
            if cat_name:
                color = "blue" if "[긍정" in cat_name else ("red" if "[부정" in cat_name else "default")
                blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat_name}, "annotations": {"bold": True, "color": color}}]}})
            
            for line in sort_sentiments(cat.get('summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
    
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_country_analysis_block(ai_data):
    blocks = [
        {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_country_title']}}]}},
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['country_analysis_desc']}, "annotations": {"color": "gray"}}]}}
    ]
    for country in ai_data.get('country_analysis', []):
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['country_flag'].format(country.get('country', '')).replace("**", "")}}]}})
        for cat in country.get('categories', []):
            cat_name = cat.get('name', '')
            if cat_name:
                color = "blue" if "[긍정" in cat_name else ("red" if "[부정" in cat_name else "default")
                blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": cat_name}, "annotations": {"bold": True, "color": color}}]}})
            
            for line in sort_sentiments(cat.get('summary', [])): blocks.append({"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": format_sentiment_line(line)}})
            quote = cat.get('quote', {})
            if quote and quote.get('original'):
                quote_children = [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['notion_quote_orig'].format(quote.get('original'))}}]}}]
                if quote.get('korean'): quote_children.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['notion_quote_ko'].format(quote.get('korean'))}}]}})
                blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['notion_toggle_quote']}, "annotations": {"color": "gray"}}], "children": quote_children}})
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def _create_notion_table(table_data_list, limit=None, is_region=False):
    col2 = ui.TEXTS['col_region'] if is_region else ui.TEXTS['col_lang']
    rows = [{"type": "table_row", "table_row": {"cells": [[{"text": {"content": ui.TEXTS['col_rank']}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": col2}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": ui.TEXTS['col_count']}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": ui.TEXTS['col_ratio']}, "annotations": {"bold": True, "color": "gray"}}], [{"text": {"content": ui.TEXTS['col_pos']}, "annotations": {"bold": True, "color": "blue"}}], [{"text": {"content": ui.TEXTS['col_neg']}, "annotations": {"bold": True, "color": "red"}}], [{"text": {"content": ui.TEXTS['col_eval']}, "annotations": {"bold": True, "color": "purple"}}]]}}]
    target_list = table_data_list[:limit] if limit else table_data_list
    for r in target_list:
        eval_val = str(r['eval'])
        eval_color = "blue" if "긍정적" in eval_val else ("red" if "부정적" in eval_val else "gray")
        name_val = str(r['region']) if is_region else str(r['lang_with_flag'])
        rows.append({"type": "table_row", "table_row": {"cells": [[{"text": {"content": str(r['rank'])}}], [{"text": {"content": name_val}}], [{"text": {"content": f"{r['count']:,}개"}}], [{"text": {"content": str(r['ratio'])}}], [{"text": {"content": str(r['pos_ratio'])}, "annotations": {"color": "blue"}}], [{"text": {"content": str(r['neg_ratio'])}, "annotations": {"color": "red"}}], [{"text": {"content": eval_val}, "annotations": {"color": eval_color, "bold": True}}]]}})
    return {"object": "block", "type": "table", "table": {"table_width": 7, "has_column_header": True, "children": rows}}

def get_language_ratio_block(store_stats, smart_reason):
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_table_global_title'].replace("### ", "")}}]}}]
    blocks.append({"object": "block", "type": "callout", "callout": {"icon": {"emoji": "⚠️"}, "color": "yellow_background", "rich_text": [{"text": {"content": ui.TEXTS['disclaimer_language'].replace("💡 ", "").replace("**", "")}}]}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['table_region_title'].replace("##### ", "")}}]}})
    blocks.append(_create_notion_table(store_stats['table_data_region'], is_region=True))
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['table_all_title'].replace("##### ", "")}}]}})
    blocks.append(_create_notion_table(store_stats['table_data_all'], limit=10))
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['toggle_all_table'].replace("👀 ", "")}}], "children": [_create_notion_table(store_stats['table_data_all'])]}})
    
    blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": ui.TEXTS['table_30_title'].replace("##### ", "")}}]}})
    if store_stats['days_since_release'] < 30:
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['info_30_days']}, "annotations": {"color": "gray"}}]}})
    else:
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": ui.TEXTS['date_period_info'].format(store_stats.get('collection_period', ''), smart_reason)}, "annotations": {"color": "gray"}}]}})
        blocks.append(_create_notion_table(store_stats['table_data_30'], limit=10))
        blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": ui.TEXTS['toggle_30_table'].replace("👀 ", "")}}], "children": [_create_notion_table(store_stats['table_data_30'])]}})
        
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    return blocks

def get_qa_block(qa_history):
    if not qa_history: return []
    blocks = [{"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": ui.TEXTS['notion_qa_title']}}]}}]
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
    except Exception as e: print(f"Error creating Notion page: {e}"); return None
        
    page_id = res.json()['id']
    children_blocks = []
    
    # 💡 [업데이트] 노션 전송 순서 완벽 재배치! (스트림릿과 100% 동일한 순서)
    children_blocks.extend(get_bot_info_block())
    children_blocks.extend(get_ai_one_liner_block(ai_data, game_name, release_date))
    children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
    children_blocks.extend(get_global_summary_block(ai_data, recent_label, smart_reason, store_stats.get('collection_period', '')))
    children_blocks.extend(get_category_summary_block(ai_data)) # 요약 밑으로 이동
    
    children_blocks.extend(get_ai_issue_pick_block(ai_data, smart_reason)) # 새로운 그룹 시작
    children_blocks.extend(get_news_summary_block(news_data, ai_data))
    
    children_blocks.extend(get_playtime_analysis_block(ai_data, store_stats))
    children_blocks.extend(get_region_analysis_block(ai_data))
    children_blocks.extend(get_country_analysis_block(ai_data))
    children_blocks.extend(get_language_ratio_block(store_stats, smart_reason))
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
        except requests.exceptions.HTTPError as e: pass
        time.sleep(0.5)
        
    return page_id
