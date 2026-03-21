from config import GEMINI_API_KEY
import json
import requests
import ui_texts as ui

def analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data, feedback=None):
    backticks = "`" * 3
    json_format = f"{backticks}json"
    
    # 💡 [복구 완료] AI가 분석할 수 있도록 데이터 완벽하게 바인딩
    feedback_instruction = f"\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{feedback}\n" if feedback else ""
    official_rating_info = store_stats.get('official_desc', '평가 없음')
    
    top_langs = [f"{r['lang']}({r['ratio']})" for r in store_stats.get('table_data_all', [])[:5]]
    top_langs_str = ", ".join(top_langs)
    
    news_text = f"- 최근 공지/뉴스: {news_data[0]}" if news_data and news_data[0] else "- 최근 공지/뉴스: 없음"
    review_text = f"--- [누적 리뷰 표본] ---\n{json.dumps(reviews_all, ensure_ascii=False)}\n\n--- [최근 리뷰 표본] ---\n{json.dumps(reviews_recent, ensure_ascii=False)}"
    
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
        .replace("{backticks}", backticks)
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        return json.loads(res.json()['candidates'][0]['content']['parts'][0]['text']), None
    except Exception as e: 
        return None, f"AI 분석 실패: {str(e)}"

def ask_followup_question(game_name, store_stats, insights, question):
    prompt = ui.TEXTS["qa_prompt_template"].replace("{question}", question).replace("{insights}", json.dumps(insights, ensure_ascii=False))
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        return res.json()['candidates'][0]['content']['parts'][0]['text'].strip(), None
    except Exception as e: 
        return None, str(e)
