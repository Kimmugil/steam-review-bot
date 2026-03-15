import requests
import json
from config import GEMINI_API_KEY
from steam_api import get_lang_name
from prompts import build_prompt

def analyze_with_gemini(game_name, review_data_all, review_data_recent, store_stats, recent_label, news_data, user_feedback=""):
    top_langs_str = ", ".join([f"{get_lang_name(k)}: {v:,}개" for k, v in sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:7]])
    
    review_text = "==== [전체 누적 평가 주요 리뷰] ====\n"
    for lang, revs in review_data_all.items():
        if revs: review_text += f"\n[{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    review_text += f"\n\n==== [{recent_label} 주요 리뷰] ====\n"
    for lang, revs in review_data_recent.items():
        if revs: review_text += f"\n[{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    if news_data:
        news_title, news_contents, news_url, news_date = news_data
    else:
        news_title, news_contents, news_url, news_date = None, None, None, None

    news_text = f"\n[최신 게임 업데이트/공지]\n- 업로드 날짜: {news_date}\n- 제목: {news_title}\n- 내용: {news_contents[:1500]}" if news_title else "제공된 최신 뉴스가 없습니다."
        
    prompt = build_prompt(game_name, store_stats, recent_label, top_langs_str, news_text, review_text, user_feedback)
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    # 온도 원복 및 토큰 아끼지 않도록 원복 (temperature=0.3)
    payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}}
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        
        # 불필요한 마크다운 백틱 제거
        if raw_text.startswith("
