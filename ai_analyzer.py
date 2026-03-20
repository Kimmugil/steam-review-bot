import requests
import json
from config import GEMINI_API_KEY
from steam_api import get_lang_name
from prompts import build_prompt

def analyze_with_gemini(game_name, review_data_all, review_data_recent, store_stats, recent_label, news_data, user_feedback=""):
    # 💡 [핵심 픽스] x[1]['total']로 접근해야 타입 에러가 안 나고 정상 정렬됨!
    top_langs_str = ", ".join([f"{get_lang_name(k)}: {v['total']:,}개" for k, v in sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1]['total'], reverse=True)[:7]])
    
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
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}], 
        "generationConfig": {
            "responseMimeType": "application/json", 
            "temperature": 0.1
        }
    }
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        
        bt = "`" * 3
        if raw_text.startswith(f"{bt}json"): raw_text = raw_text[7:]
        if raw_text.startswith(bt): raw_text = raw_text[3:]
        if raw_text.endswith(bt): raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
        
        return json.loads(raw_text), None
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429: return None, "429 Client Error"
        return None, f"API 에러 ({e.response.status_code})"
    except json.JSONDecodeError as e:
        return None, f"JSON_DECODE_ERROR: {str(e)}"
    except Exception as e: 
        error_msg = str(e)
        if GEMINI_API_KEY and GEMINI_API_KEY in error_msg:
            error_msg = error_msg.replace(GEMINI_API_KEY, "********")
        return None, error_msg

def ask_followup_question(game_name, store_stats, insights, question):
    from config import GEMINI_API_KEY
    import json
    import requests
    
    prompt = f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'에 대해 이미 작성된 분석 리포트와 데이터를 바탕으로, 팀원의 추가 질문에 빠르고 객관적으로 답변해줘.
    
    [팀원 질문]: {question}
    
    [참고 데이터 - 초기 분석 결과]:
    {json.dumps(insights, ensure_ascii=False)}
    
    답변 작성 규칙:
    1. 팩트 기반으로 3~4문장 이내로 핵심만 대답할 것.
    2. 제공된 데이터 내에서 유추할 수 없는 내용은 "제공된 데이터에서는 확인이 어렵습니다"라고 할 것.
    3. 노션에 텍스트로 들어갈 예정이므로 마크다운 볼드체 등 특수기호는 가급적 사용하지 말 것.
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}".strip()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}], 
        "generationConfig": {"temperature": 0.2}
    }
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        return raw_text, None
    except Exception as e:
        return None, str(e)
