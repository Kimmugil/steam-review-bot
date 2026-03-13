# ai_analyzer.py
import requests
import json
from config import GEMINI_API_KEY
from steam_api import get_lang_name

def analyze_with_gemini(game_name, review_data_all, review_data_recent, store_stats, recent_label, news_data, user_feedback=""):
    # 언어 비중 문자열 생성
    top_langs_str = ", ".join([f"{get_lang_name(k)}: {v:,}개" for k, v in sorted(store_stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:7]])
    
    # 리뷰 텍스트 조립
    review_text = "==== [전체 누적 평가 주요 리뷰] ====\n"
    for lang, revs in review_data_all.items():
        if revs: 
            review_text += f"\n[{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    review_text += f"\n\n==== [{recent_label} 주요 리뷰] ====\n"
    for lang, revs in review_data_recent.items():
        if revs: 
            review_text += f"\n[{get_lang_name(lang)}]\n" + "\n".join(revs)
        
    # 뉴스 데이터 처리
    if news_data:
        news_title, news_contents, news_url, news_date = news_data
    else:
        news_title, news_contents, news_url, news_date = None, None, None, None

    news_text = f"\n[최신 게임 업데이트/공지]\n- 업로드 날짜: {news_date}\n- 제목: {news_title}\n- 내용: {news_contents[:1500]}" if news_title else "제공된 최신 뉴스가 없습니다."
    feedback_instruction = f"\n\n[사용자 추가 피드백!! 반드시 최우선으로 반영할 것!]:\n{user_feedback}\n" if user_feedback else ""
        
    # 프롬프트 구성 (과장된 표현 지양 및 인사이트 도출 강조)
    prompt = f"""
    넌 글로벌 게임 사업 PM이야. '{game_name}'의 스팀 유저 평가 데이터야.{feedback_instruction}
    
    🎯 [필수 선행 지시사항]: 
    분석을 시작하기 전, 반드시 해당 게임에 대한 포괄적인 배경지식, 세계관, 개발사, 핵심 특징 등을 인지하고, 이를 바탕으로 리뷰의 맥락을 깊게 해석해. 
    주의: 검색된 정보 중 유저의 사견은 배제하고 객관적 팩트 위주로 참고할 것.
    
    작성 규칙:
    1. 마크다운 기호 금지. 요약은 간결하게 작성.
    2. global_category_summary 작성 시, [긍정평가] 항목을 모두 먼저 쓰고 그 뒤에 [부정평가] 항목 나열.
    3. 리뷰 인용 시, 타 언어는 [원문]과 [한국어 번역] 필수 기재. 단, 원래 '한국어' 리뷰는 [원문]만 작성.
    4. 국가별 세부 평가 작성 시, 해당 국가 리뷰의 긍정/부정 카테고리를 최대한 많이 배열로 도출할 것.
    5. news_summary는 공지/업데이트의 핵심을 3~4개의 배열 형태로 요약할 것.
    6. 플레이타임별 분석: 뉴비 유저와 코어 유저의 여론을 분리하여 분석할 것.
    7. 그룹간 교차 분석: 뉴비와 코어 유저 간 공통/상반된 평가를 교차 비교할 것.
    8. 추가 규칙: final_summary_all, final_summary_recent의 각 항목 맨 앞에 반드시 '[긍정]' 또는 '[부정]' 머리말을 붙일 것. 긍정 항목을 먼저 나열할 것.
    9. 추가 규칙: ai_issue_pick 작성 시 단순 현상 나열이 아니라 그로 인한 인사이트(시사점)를 반드시 포함할 것 (예: 서버 불안정 지속으로 인한 유저 이탈 가속화 우려).
    10. 어조 규칙: '찬사', '똑똑한 분석' 등 과장된 표현은 절대 사용하지 말고 담백하고 객관적인 비즈니스 리포트 톤을 유지할 것.
    
    {{
      "critic_one_liner": "한줄평",
      "sentiment_analysis": "민심 코멘트",
      "language_analysis": "언어 비중 코멘트",
      "final_summary_all": ["[긍정] 요약1", "[부정] 요약2"],
      "final_summary_recent": ["[긍정] 요약1", "[부정] 요약2"],
      "ai_issue_pick": ["이슈 현상 및 인사이트 1", "이슈 현상 및 인사이트 2"],
      "news_summary": ["공지 요약1"],
      "playtime_analysis": {{
        "comparison_insights": ["교차 인사이트1"],
        "newbie_title": "뉴비 여론", "newbie_summary": ["요약1"],
        "core_title": "코어 여론", "core_summary": ["요약1"]
      }},
      "global_category_summary": [
        {{ "category": "[긍정평가]...", "summary": ["요약"] }},
        {{ "category": "[부정평가]...", "summary": ["요약"] }}
      ],
      "country_analysis": [
        {{
          "language": "한국어",
          "categories": [
            {{ "name": "...", "summary": ["..."], "quote": "..." }}
          ]
        }}
      ]
    }}
    
    [통계 데이터]
    - 전체 누적 평가: {store_stats['all_desc']}
    - {recent_label} 민심: {store_stats['recent_desc']}
    - 누적 리뷰 언어 비중: {top_langs_str}
    {news_text}
    
    [리뷰 데이터]
    {review_text}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}], 
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}
    }
    
    try:
        res = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'))
        res.raise_for_status()
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:-3].strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:-3].strip()
            
        return json.loads(raw_text), None
        
    except requests.exceptions.HTTPError as e:
        # 보안 패치 1: HTTP 에러 발생 시 URL 노출 차단
        if e.response.status_code == 429:
            return None, "429 Client Error"
        return None, f"API 통신 에러 (코드: {e.response.status_code})"
        
    except Exception as e: 
        # 보안 패치 2: 기타 에러 메시지 내 API 키 마스킹 처리
        error_msg = str(e)
        if GEMINI_API_KEY and GEMINI_API_KEY in error_msg:
            error_msg = error_msg.replace(GEMINI_API_KEY, "********")
        return None, error_msg
