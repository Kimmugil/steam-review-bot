from config import GEMINI_API_KEY
import json
import requests
import ui_texts as ui

def analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data, feedback=None):
    backticks = "`" * 3
    json_format = f"{backticks}json"
    
    # 💡 [핵심 최적화] 프롬프트를 ui_texts에서 호출하여 데이터만 맵핑!
    prompt = ui.TEXTS["ai_prompt_template"] \
        .replace("{game_name}", game_name) \
        .replace("{all_desc}", store_stats['all_desc']) \
        .replace("{all_total}", str(store_stats['all_total'])) \
        .replace("{news_data}", news_data[0] if news_data[0] else '없음') \
        .replace("{reviews_all}", json.dumps(reviews_all, ensure_ascii=False)) \
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
    prompt = ui.TEXTS["qa_prompt_template"] \
        .replace("{question}", question) \
        .replace("{insights}", json.dumps(insights, ensure_ascii=False))
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        return res.json()['candidates'][0]['content']['parts'][0]['text'].strip(), None
    except Exception as e: 
        return None, str(e)
