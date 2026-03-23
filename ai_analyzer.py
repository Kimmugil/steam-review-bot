from config import GEMINI_API_KEY
import json
import requests
import ui_texts as ui
from config import LANG_MAP

def get_lang_name(lang_code):
    return LANG_MAP.get(lang_code, f"🏳️ {lang_code}")

def analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data, feedback=None):
    backticks = "`" * 3
    json_format = f"{backticks}json"

    feedback_instruction = f"\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{feedback}\n" if feedback else ""
    official_rating_info = store_stats.get('official_desc', '평가 없음')

    top_langs = [f"{r['lang']}({r['ratio']})" for r in store_stats.get('table_data_all', [])[:5]]
    top_langs_str = ", ".join(top_langs)

    news_text = f"- 최근 공지/뉴스: {news_data[0]}" if news_data and news_data[0] else "- 최근 공지/뉴스: 없음"
    review_text = f"--- [누적 리뷰 표본] ---\n{json.dumps(reviews_all, ensure_ascii=False)}\n\n--- [최근 리뷰 표본] ---\n{json.dumps(reviews_recent, ensure_ascii=False)}"

    # country_analysis 순서 지시문 생성
    # country_langs_ordered: ["english", "koreana", ...] → AI에게 정확한 순서로 작성하도록 명시
    country_langs_ordered = store_stats.get('country_langs_ordered', [])
    if country_langs_ordered:
        ordered_names = [get_lang_name(l) for l in country_langs_ordered]
        country_order_instruction = (
            f"\n    15. [⚠️ 절대 규칙] country_analysis 배열은 반드시 아래 순서대로만 작성할 것. "
            f"이 순서는 누적 리뷰 비중 순위 기반이며 절대 변경 금지:\n"
            + "\n".join([f"        {i+1}위: {name}" for i, name in enumerate(ordered_names)])
            + f"\n        총 {len(ordered_names)}개 국가만 작성. 이 목록에 없는 언어는 country_analysis에 포함하지 말 것."
        )
    else:
        country_order_instruction = ""

    prompt = ui.TEXTS["ai_prompt_template"] \
        .replace("{game_name}", game_name) \
        .replace("{feedback_instruction}", feedback_instruction) \
        .replace("{official_rating_info}", official_rating_info) \
        .replace("{all_desc}", store_stats.get('all_desc', '')) \
        .replace("{all_total}", str(store_stats.get('all_total', 0))) \
        .replace("{recent_label}", recent_label) \
        .replace("{recent_desc}", store_stats.get('recent_desc', '')) \
        .replace("{recent_total}", str(store_stats.get('recent_total', 0))) \
        .replace("{top_langs_str}", top_langs_str) \
        .replace("{newbie_avg}", str(store_stats.get('newbie_avg', 0))) \
        .replace("{norm_avg}", str(store_stats.get('norm_avg', 0))) \
        .replace("{core_avg}", str(store_stats.get('core_avg', 0))) \
        .replace("{news_text}", news_text) \
        .replace("{review_text}", review_text) \
        .replace("{json_format}", json_format) \
        .replace("{backticks}", backticks) \
        .replace("{country_order_instruction}", country_order_instruction)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }

    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        return json.loads(res.json()['candidates'][0]['content']['parts'][0]['text']), None
    except Exception as e:
        return None, f"AI 분석 실패: {str(e)}"


def ask_followup_question(game_name, store_stats, insights, question):
    """중복 선언 제거 — ui_texts.qa_prompt_template 단일 사용"""
    prompt = ui.TEXTS["qa_prompt_template"] \
        .replace("{question}", question) \
        .replace("{insights}", json.dumps(insights, ensure_ascii=False))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2}
    }
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        return res.json()['candidates'][0]['content']['parts'][0]['text'].strip(), None
    except Exception as e:
        return None, str(e)
