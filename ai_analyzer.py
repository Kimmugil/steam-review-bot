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

    # ── 역할별 리뷰 섹션 분리 ─────────────────────────────────────────────
    summary_langs  = set(store_stats.get('summary_langs', []))
    region_langs   = set(store_stats.get('region_langs', []))
    issue_langs    = set(store_stats.get('issue_langs', []))
    country_langs  = set(store_stats.get('country_langs_ordered', []))
    summary_coverage = store_stats.get('summary_coverage', 0)

    def fmt_reviews(lang_dict, lang_set, label):
        lines = []
        for lang, revs in lang_dict.items():
            if lang in lang_set and revs:
                lines.append(f"  [{get_lang_name(lang)}]")
                lines.extend([f"    {r}" for r in revs])
        return f"--- [{label}] ---\n" + ("\n".join(lines) if lines else "  (없음)")

    all_summary_text = fmt_reviews(reviews_all, summary_langs,  f"전체 여론 동향용 누적 리뷰 (전체 비중 약 {summary_coverage}% 커버)")
    all_region_text  = fmt_reviews(reviews_all, region_langs,   "권역별 세부 평가용 누적 리뷰 (9대 권역 × 권역당 상위 3개 언어)")
    all_country_text = fmt_reviews(reviews_all, country_langs,  "국가별 원문 분석용 누적 리뷰 (누적 TOP3 + 한국어)")
    rec_summary_text = fmt_reviews(reviews_recent, summary_langs, f"전체 여론 동향용 최근 리뷰 (전체 비중 약 {summary_coverage}% 커버)")
    rec_issue_text   = fmt_reviews(reviews_recent, issue_langs,   "이슈픽용 최근 리뷰 (최근 기간 상위 5개 언어)")
    rec_country_text = fmt_reviews(reviews_recent, country_langs, "국가별 원문 분석용 최근 리뷰")

    review_text = "\n\n".join([
        all_summary_text, all_region_text, all_country_text,
        rec_summary_text, rec_issue_text, rec_country_text,
    ])

    # ── country_analysis 순서 지시문 ──────────────────────────────────────
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


def ask_followup_question(game_name, store_stats, insights, question, reviews_all=None, reviews_recent=None):
    """
    Q&A — 분석 결과(insights) + 리뷰 원문(reviews_all/recent) 모두 전달.
    화면에 표시되지 않은 주제(예: 아트스타일 원문 등)도 리뷰에서 직접 찾아 답변 가능.
    reviews_all/reviews_recent가 없으면 기존처럼 insights만 사용.
    """
    # 리뷰 원문 섹션 구성 (있을 경우에만)
    review_context = ""
    if reviews_all or reviews_recent:
        lines = ["[수집된 전체 리뷰 원문 — 리포트에 표시되지 않은 내용도 여기서 찾을 수 있음]"]
        if reviews_all:
            lines.append("--- [누적 리뷰] ---")
            for lang, revs in reviews_all.items():
                if revs:
                    lines.append(f"  [{get_lang_name(lang)}]")
                    lines.extend([f"    {r}" for r in revs])
        if reviews_recent:
            lines.append("--- [최근 기간 리뷰] ---")
            for lang, revs in reviews_recent.items():
                if revs:
                    lines.append(f"  [{get_lang_name(lang)}]")
                    lines.extend([f"    {r}" for r in revs])
        review_context = "\n" + "\n".join(lines)

    prompt = ui.TEXTS["qa_prompt_template"] \
        .replace("{question}", question) \
        .replace("{insights}", json.dumps(insights, ensure_ascii=False)) \
        .replace("{review_context}", review_context)

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
