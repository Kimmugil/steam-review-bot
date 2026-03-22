import requests
import json
import time
from datetime import datetime, timedelta, timezone
from config import NOTION_TOKEN, NOTION_DATABASE_ID, APP_VERSION
import ui_texts as ui

def get_cat_sort_key(cat_name):
    if "[긍정" in cat_name: return 0
    elif "[부정" in cat_name: return 1
    return 2

def sort_sentiments(lines):
    if not isinstance(lines, list): return []
    return sorted(lines, key=lambda l: 0 if "[긍정]" in l else (1 if "[부정]" in l else 2))

# 긍/부정 머리말을 색상 강조로 렌더링
def format_sentiment_line(line):
    if line.startswith("[긍정]"):
        return [{"text": {"content": "긍정  "}, "annotations": {"color": "blue", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    elif line.startswith("[부정]"):
        return [{"text": {"content": "부정  "}, "annotations": {"color": "red", "bold": True}}, {"text": {"content": line[4:].strip()}}]
    return [{"text": {"content": line}}]

# 카테고리명에서 [긍정]/[부정] 제거 후 색상 반환
def cat_color(cat_name):
    if "[긍정" in cat_name: return "blue"
    if "[부정" in cat_name: return "red"
    return "default"

def clean_cat_name(cat_name):
    return cat_name.replace("[긍정]", "").replace("[부정]", "").strip()

def divider():
    return {"object": "block", "type": "divider", "divider": {}}

def heading2(text):
    return {"object": "block", "type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": text}}]}}

def heading3(text, color="default"):
    return {"object": "block", "type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": text}, "annotations": {"color": color}}]}}

def paragraph(rich_text_list):
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich_text_list}}

def callout(emoji, text, color="gray_background", bold=False, link=None):
    anno = {"bold": bold} if bold else {}
    return {"object": "block", "type": "callout", "callout": {"icon": {"emoji": emoji}, "color": color, "rich_text": [{"text": {"content": text, "link": link}, "annotations": anno}]}}

def bullet(rich_text_list):
    return {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": rich_text_list}}

def toggle(label_text, children, color="gray"):
    return {"object": "block", "type": "toggle", "toggle": {"rich_text": [{"text": {"content": label_text}, "annotations": {"color": color}}], "children": children}}

# ── 봇 안내 ───────────────────────────────────────────────────────────────
def get_bot_info_block():
    return [toggle(ui.TEXTS['bot_info_title'], [paragraph([{"text": {"content": ui.TEXTS['bot_info_desc']}}])])]

# ── AI 한줄평 ─────────────────────────────────────────────────────────────
def get_ai_one_liner_block(ai_data, game_name, release_date):
    return [
        heading2(ui.TEXTS['ai_one_liner_title']),
        {"object": "block", "type": "callout", "callout": {
            "icon": {"emoji": "💬"}, "color": "gray_background",
            "rich_text": [{"text": {"content": f"❝ {ai_data.get('critic_one_liner', '')} ❞"}, "annotations": {"bold": True}}]
        }},
        paragraph([{"text": {"content": ui.TEXTS['ai_one_liner_desc'].format(release_date, game_name)}, "annotations": {"color": "gray"}}]),
        divider()
    ]

# ── 민심 온도계 ───────────────────────────────────────────────────────────
def get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data):
    official = store_stats.get('official_desc', ui.TEXTS['steam_eval_none'])
    all_desc = store_stats['all_desc']
    all_total = store_stats['all_total']
    rec_desc = store_stats['recent_desc']
    rec_total = store_stats['recent_total']

    # 평점 색상
    def score_color(val):
        if "긍정" in str(val): return "blue"
        if "부정" in str(val): return "red"
        return "gray"

    blocks = [
        heading2(ui.TEXTS['notion_metric_title']),
        toggle(ui.TEXTS['notion_toggle_guide'], [
            bullet([{"text": {"content": f"스팀 공식 평점: {ui.TEXTS['tooltip_official']}"}}]),
            bullet([{"text": {"content": f"전체 누적 평점: {ui.TEXTS['tooltip_all']}"}}]),
            bullet([{"text": {"content": f"최근 동향: {smart_reason}"}}])
        ]),
        # 3개 지표를 한 단락에 줄바꿈으로 나열
        paragraph([
            {"text": {"content": f"🛑 스팀 공식 평점: "}, "annotations": {"color": "gray"}},
            {"text": {"content": official}, "annotations": {"color": score_color(official), "bold": True}},
            {"text": {"content": "\n📈 전체 누적 평가: "}, "annotations": {"color": "gray"}},
            {"text": {"content": f"{all_desc}"}, "annotations": {"color": score_color(all_desc), "bold": True}},
            {"text": {"content": f"  (총 {all_total:,}개)", "link": None}, "annotations": {"color": "gray"}},
            {"text": {"content": f"\n🔥 {recent_label}: "}, "annotations": {"color": "gray"}},
            {"text": {"content": f"{rec_desc}"}, "annotations": {"color": score_color(rec_desc), "bold": True}},
            {"text": {"content": f"  (표본 {rec_total:,}개)"}, "annotations": {"color": "gray"}}
        ]),
        # 종합 브리핑
        {"object": "block", "type": "callout", "callout": {
            "icon": {"emoji": "🎯"}, "color": "gray_background",
            "rich_text": [
                {"text": {"content": "종합 여론 브리핑\n"}, "annotations": {"bold": True}},
                {"text": {"content": ai_data.get('sentiment_analysis', '')}}
            ]
        }},
        divider()
    ]
    return blocks

# ── 전체 요약 ─────────────────────────────────────────────────────────────
def get_global_summary_block(ai_data, recent_label, smart_reason, collection_period):
    blocks = [
        heading2(ui.TEXTS['notion_summary_title']),
        heading3(ui.TEXTS['notion_summary_all'])
    ]
    for line in sort_sentiments(ai_data.get('final_summary_all', [])):
        blocks.append(bullet(format_sentiment_line(line)))

    blocks.append(heading3(ui.TEXTS['notion_summary_recent'].format(recent_label)))
    period_text = ui.TEXTS['date_period_info'].format(collection_period, smart_reason).replace("  \n", " ")
    blocks.append(paragraph([{"text": {"content": period_text}, "annotations": {"color": "gray"}}]))
    for line in sort_sentiments(ai_data.get('final_summary_recent', [])):
        blocks.append(bullet(format_sentiment_line(line)))

    blocks.append(divider())
    return blocks

# ── 카테고리별 평가 ───────────────────────────────────────────────────────
def get_category_summary_block(ai_data):
    if not ai_data.get('global_category_summary'): return []
    blocks = [heading2(ui.TEXTS['notion_category_summary_title'].replace("### ", ""))]
    cats = sorted(ai_data.get('global_category_summary', []), key=lambda x: get_cat_sort_key(x.get('category', '')))
    for cat in cats:
        cat_name = cat.get('category', '')
        color = cat_color(cat_name)
        clean = clean_cat_name(cat_name)
        # 카테고리 제목: 긍정/부정 텍스트 + 카테고리명 같은 줄에
        prefix = "긍정  " if "[긍정" in cat_name else ("부정  " if "[부정" in cat_name else "")
        prefix_color = color if color != "default" else "gray"
        blocks.append({"object": "block", "type": "heading_3", "heading_3": {"rich_text": [
            {"text": {"content": prefix}, "annotations": {"color": prefix_color, "bold": True}},
            {"text": {"content": clean}, "annotations": {"color": "default"}}
        ]}})
        for line in sort_sentiments(cat.get('summary', [])):
            blocks.append(bullet(format_sentiment_line(line)))
    blocks.append(divider())
    return blocks

# ── 최신 소식 ─────────────────────────────────────────────────────────────
def get_news_summary_block(news_data, ai_data):
    if not news_data or not news_data[0]: return []
    news_title, _, news_url, news_date = news_data[:4]
    blocks = [heading2(ui.TEXTS['notion_news_title'].replace("### ", ""))]
    if len(news_data) > 4 and news_data[4]:
        blocks.append({"object": "block", "type": "image", "image": {"type": "external", "external": {"url": news_data[4]}}})
    blocks.append({"object": "block", "type": "callout", "callout": {
        "icon": {"emoji": "🔗"}, "color": "gray_background",
        "rich_text": [
            {"text": {"content": f"{news_date}  "}, "annotations": {"color": "gray"}},
            {"text": {"content": news_title, "link": {"url": news_url}}, "annotations": {"bold": True, "underline": True}}
        ]
    }})
    for line in ai_data.get('news_summary', []):
        blocks.append(bullet([{"text": {"content": line}}]))
    blocks.append(divider())
    return blocks

# ── 주요 이슈 픽 ──────────────────────────────────────────────────────────
def get_ai_issue_pick_block(ai_data, smart_reason):
    blocks = [
        heading2(ui.TEXTS['notion_issue_pick_title'].replace("### ", "")),
        paragraph([{"text": {"content": ui.TEXTS["issue_pick_desc"].format(smart_reason)}, "annotations": {"color": "gray"}}])
    ]
    issues = ai_data.get('ai_issue_pick', [])
    if issues:
        for issue in issues:
            blocks.append(bullet([{"text": {"content": issue}}]))
    else:
        blocks.append(callout("ℹ️", ui.TEXTS["no_issue_pick"]))
    blocks.append(divider())
    return blocks

# ── 플레이타임 분석 ───────────────────────────────────────────────────────
def get_playtime_analysis_block(ai_data, stats):
    pt = ai_data.get('playtime_analysis', {})
    if not pt: return []
    blocks = [
        heading2(ui.TEXTS['notion_playtime_title']),
        toggle(ui.TEXTS['notion_toggle_playtime'], [paragraph([{"text": {"content": ui.TEXTS['tooltip_playtime']}}])])
    ]
    if pt.get('comparison_insights'):
        items = [bullet([{"text": {"content": l}}]) for l in pt['comparison_insights'] if isinstance(l, str) and l.strip()]
        blocks.append({"object": "block", "type": "callout", "callout": {
            "icon": {"emoji": "⚖️"}, "color": "gray_background",
            "rich_text": [{"text": {"content": ui.TEXTS['insight_core_title']}, "annotations": {"bold": True}}],
            "children": items
        }})

    for title_key, total_key, avg_key, desc_key, summary_key, default_title, color in [
        ('newbie_title', 'newbie_total', 'newbie_avg', 'newbie_desc', 'newbie_summary', ui.TEXTS['newbie_title_default'], "green"),
        ('normal_title', 'norm_total',  'norm_avg',   'norm_desc',   'normal_summary', ui.TEXTS['normal_title_default'], "blue"),
        ('core_title',   'core_total',  'core_avg',   'core_desc',   'core_summary',   ui.TEXTS['core_title_default'],   "purple"),
    ]:
        blocks.append(heading3(pt.get(title_key, default_title), color))
        blocks.append(paragraph([{"text": {"content": ui.TEXTS['sample_opinion'].format(stats.get(total_key, 0), stats.get(avg_key, 0), stats.get(desc_key, ui.TEXTS['steam_eval_none']))}, "annotations": {"color": "gray"}}]))
        for line in sort_sentiments(pt.get(summary_key, [])):
            blocks.append(bullet(format_sentiment_line(line)))

    blocks.append(divider())
    return blocks

# ── 권역별 분석 ───────────────────────────────────────────────────────────
def get_region_analysis_block(ai_data):
    reg_data = ai_data.get('region_analysis', {})
    if not reg_data: return []
    blocks = [
        heading2(ui.TEXTS['notion_region_title']),
        toggle(ui.TEXTS['notion_toggle_region'], [paragraph([{"text": {"content": ui.TEXTS['tooltip_region']}}])])
    ]
    if reg_data.get('divergence_insight'):
        blocks.append({"object": "block", "type": "callout", "callout": {
            "icon": {"emoji": "💡"}, "color": "gray_background",
            "rich_text": [
                {"text": {"content": f"{ui.TEXTS['divergence_insight_title']}\n"}, "annotations": {"bold": True}},
                {"text": {"content": reg_data['divergence_insight']}}
            ]
        }})
    for reg in reg_data.get('regions', []):
        blocks.append(heading3(ui.TEXTS['region_expander'].format(reg.get('region'), reg.get('trend'))))
        blocks.append(paragraph([{"text": {"content": ui.TEXTS['keyword_label'].format(', '.join(reg.get('keywords', [])))}, "annotations": {"color": "gray"}}]))
        for cat in sorted(reg.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
            cat_name = cat.get('name', '')
            if cat_name:
                clean = clean_cat_name(cat_name)
                prefix = "긍정  " if "[긍정" in cat_name else ("부정  " if "[부정" in cat_name else "")
                prefix_color = cat_color(cat_name)
                blocks.append(paragraph([
                    {"text": {"content": prefix}, "annotations": {"color": prefix_color if prefix_color != "default" else "gray", "bold": True}},
                    {"text": {"content": clean}, "annotations": {"bold": True}}
                ]))
            for line in sort_sentiments(cat.get('summary', [])):
                blocks.append(bullet(format_sentiment_line(line)))
    blocks.append(divider())
    return blocks

# ── 국가별 원문 분석 ──────────────────────────────────────────────────────
def get_country_analysis_block(ai_data):
    blocks = [
        heading2(ui.TEXTS['notion_country_title']),
        paragraph([{"text": {"content": ui.TEXTS['country_analysis_desc']}, "annotations": {"color": "gray"}}])
    ]
    for country in ai_data.get('country_analysis', []):
        blocks.append(heading3(f"🚩 {country.get('country', '')}"))
        for cat in sorted(country.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
            cat_name = cat.get('name', '')
            if cat_name:
                clean = clean_cat_name(cat_name)
                prefix = "긍정  " if "[긍정" in cat_name else ("부정  " if "[부정" in cat_name else "")
                prefix_color = cat_color(cat_name)
                blocks.append(paragraph([
                    {"text": {"content": prefix}, "annotations": {"color": prefix_color if prefix_color != "default" else "gray", "bold": True}},
                    {"text": {"content": clean}, "annotations": {"bold": True}}
                ]))
            for line in sort_sentiments(cat.get('summary', [])):
                blocks.append(bullet(format_sentiment_line(line)))
            # 리뷰 원문 — 토글로 감싸기
            quote = cat.get('quote', {})
            if quote and quote.get('original'):
                quote_children = [paragraph([{"text": {"content": ui.TEXTS['notion_quote_orig'].format(quote.get('original'))}}])]
                if quote.get('korean'):
                    quote_children.append(paragraph([{"text": {"content": ui.TEXTS['notion_quote_ko'].format(quote.get('korean'))}}]))
                blocks.append(toggle(ui.TEXTS['notion_toggle_quote'], quote_children))
    blocks.append(divider())
    return blocks

# ── 언어/권역 통계 ────────────────────────────────────────────────────────
def _create_notion_table(table_data_list, limit=None, is_region=False):
    col2 = ui.TEXTS['col_region'] if is_region else ui.TEXTS['col_lang']
    header_row = {"type": "table_row", "table_row": {"cells": [
        [{"text": {"content": ui.TEXTS['col_rank']}, "annotations": {"bold": True, "color": "gray"}}],
        [{"text": {"content": col2}, "annotations": {"bold": True, "color": "gray"}}],
        [{"text": {"content": ui.TEXTS['col_count']}, "annotations": {"bold": True, "color": "gray"}}],
        [{"text": {"content": ui.TEXTS['col_ratio']}, "annotations": {"bold": True, "color": "gray"}}],
        [{"text": {"content": ui.TEXTS['col_pos']}, "annotations": {"bold": True, "color": "blue"}}],
        [{"text": {"content": ui.TEXTS['col_neg']}, "annotations": {"bold": True, "color": "red"}}],
        [{"text": {"content": ui.TEXTS['col_eval']}, "annotations": {"bold": True, "color": "gray"}}],
    ]}}
    rows = [header_row]
    target = table_data_list[:limit] if limit else table_data_list
    for r in target:
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
            [{"text": {"content": eval_val}, "annotations": {"color": eval_color, "bold": True}}],
        ]}})
    return {"object": "block", "type": "table", "table": {"table_width": 7, "has_column_header": True, "children": rows}}

def get_language_ratio_block(store_stats, smart_reason):
    blocks = [
        heading2(ui.TEXTS['notion_table_global_title'].replace("### ", "")),
        callout("⚠️", ui.TEXTS['disclaimer_language'].replace("💡 ", "").replace("**", ""))
    ]
    blocks.append(heading3(ui.TEXTS['table_region_title'].replace("##### ", "")))
    blocks.append(_create_notion_table(store_stats['table_data_region'], is_region=True))

    blocks.append(heading3(ui.TEXTS['table_all_title'].replace("##### ", "")))
    blocks.append(_create_notion_table(store_stats['table_data_all'], limit=10))
    blocks.append(toggle(ui.TEXTS['toggle_all_table'].replace("👀 ", ""), [_create_notion_table(store_stats['table_data_all'])]))

    blocks.append(heading3(ui.TEXTS['table_30_title'].replace("##### ", "")))
    if store_stats['days_since_release'] < 30:
        blocks.append(paragraph([{"text": {"content": ui.TEXTS['info_30_days']}, "annotations": {"color": "gray"}}]))
    else:
        period_text = ui.TEXTS['date_period_info'].format(store_stats.get('collection_period', ''), smart_reason).replace("  \n", " ")
        blocks.append(paragraph([{"text": {"content": period_text}, "annotations": {"color": "gray"}}]))
        blocks.append(_create_notion_table(store_stats['table_data_30'], limit=10))
        blocks.append(toggle(ui.TEXTS['toggle_30_table'].replace("👀 ", ""), [_create_notion_table(store_stats['table_data_30'])]))

    blocks.append(divider())
    return blocks

# ── Q&A ────────────────────────────────────────────────────────────────────
def get_qa_block(qa_history):
    if not qa_history: return []
    blocks = [heading2(ui.TEXTS['notion_qa_title'])]
    for qa in qa_history:
        blocks.append(paragraph([{"text": {"content": f"Q. {qa['q']}"}, "annotations": {"bold": True, "color": "blue"}}]))
        blocks.append(callout("🤖", qa['a']))
    return blocks

# ── 발행 메인 ─────────────────────────────────────────────────────────────
def upload_to_notion(app_id, game_name, release_date, store_stats, ai_data, recent_label, smart_reason, news_data, qa_history):
    headers = {"Authorization": f"Bearer {NOTION_TOKEN}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)
    iso_timestamp = now_kst.strftime('%Y-%m-%dT%H:%M:%S+09:00')

    create_data = {
        "parent": {"database_id": NOTION_DATABASE_ID},
        "properties": {
            "이름": {"title": [{"text": {"content": f"{game_name} 평가 요약"}}]},
            "추출 시점": {"date": {"start": iso_timestamp}},
            "탈곡기 버전": {"rich_text": [{"text": {"content": APP_VERSION}}]}
        }
    }
    try:
        res = requests.post("https://api.notion.com/v1/pages", headers=headers, data=json.dumps(create_data))
        res.raise_for_status()
    except Exception as e:
        print(f"노션 페이지 생성 실패: {e}"); return None

    page_id = res.json()['id']
    children_blocks = []
    children_blocks.extend(get_bot_info_block())
    children_blocks.extend(get_ai_one_liner_block(ai_data, game_name, release_date))
    children_blocks.extend(get_steam_sentiment_block(store_stats, recent_label, smart_reason, ai_data))
    children_blocks.extend(get_global_summary_block(ai_data, recent_label, smart_reason, store_stats.get('collection_period', '')))
    children_blocks.extend(get_category_summary_block(ai_data))
    children_blocks.extend(get_news_summary_block(news_data, ai_data))
    children_blocks.extend(get_ai_issue_pick_block(ai_data, smart_reason))
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
        except requests.exceptions.HTTPError as e:
            pass
        time.sleep(0.5)

    return page_id
