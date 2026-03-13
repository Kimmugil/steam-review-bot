import requests
import urllib.parse
from datetime import datetime
from config import LANG_MAP, SCORE_MAP

def get_lang_name(lang_code):
    return LANG_MAP.get(lang_code, f"🏳️ {lang_code}")

def calculate_custom_score(pos_ratio, total):
    if total == 0: return "평가 없음"
    if pos_ratio >= 0.95: return "압도적으로 긍정적"
    elif pos_ratio >= 0.80: return "매우 긍정적"
    elif pos_ratio >= 0.70: return "대체로 긍정적"
    elif pos_ratio >= 0.40: return "복합적"
    elif pos_ratio >= 0.20: return "대체로 부정적"
    elif pos_ratio >= 0.01: return "매우 부정적"
    return "압도적으로 부정적"

def get_steam_game_info(game_input):
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None
    
    details_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean"
    res = requests.get(details_url)
    res.raise_for_status()
    data = res.json()
    
    if not data or app_id not in data or not data[app_id]['success']: 
        return None, None, None
        
    game_data = data[app_id]['data']
    exact_name = game_data['name'].encode('utf-8', 'ignore').decode('utf-8')
    
    try: 
        raw_date = game_data['release_date']['date']
        clean_date = raw_date.replace("년 ", "-").replace("월 ", "-").replace("일", "")
        release_date = datetime.strptime(clean_date, "%Y-%m-%d")
    except: 
        release_date = datetime(2020, 1, 1)
        
    return app_id, exact_name, release_date

def fetch_latest_news(app_id):
    url = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=5&maxlength=3000&format=json"
    try:
        res = requests.get(url, timeout=5)
        res.raise_for_status()
        news_items = res.json().get('appnews', {}).get('newsitems', [])
        
        if not news_items: return None, None, None, None
            
        def parse_item(item):
            date_str = datetime.fromtimestamp(item.get('date', 0)).strftime('%Y-%m-%d')
            return item['title'], item.get('contents', ''), item['url'], date_str

        for item in news_items:
            title_lower = item.get('title', '').lower()
            if 'update' in title_lower or 'patch' in title_lower or '패치' in title_lower or '업데이트' in title_lower:
                return parse_item(item)
                
        for item in news_items:
            if item.get('feed_type') == 1: return parse_item(item)
                
        return parse_item(news_items[0])
    except: pass
    return None, None, None, None

def get_smart_period(release_date):
    days_since = (datetime.now() - release_date).days
    if days_since < 3: return None, "전체 주요 동향", "출시 3일 미만으로 데이터가 적어 '전체 동향 대비 주요 동향' 위주로 분석했습니다."
    elif days_since < 7: return 3, "최근 3일 동향", "출시 7일 미만인 초기 게임이므로 '최근 3일 내 동향'을 기준으로 민심을 분석했습니다."
    elif days_since < 30: return 7, "최근 7일 동향", "출시 30일 미만의 신작이므로 '최근 7일 내 동향'을 기준으로 민심을 분석했습니다."
    return 30, "최근 30일 동향", "출시 30일 이상 경과하여 '최근 30일 내 동향'을 기준으로 민심을 분석했습니다."

def fetch_lang_reviews(app_id, lang, day_range=None):
    """특정 언어의 리뷰만 집중적으로 긁어오는 함수"""
    reviews = []
    base_url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=all&language={lang}&num_per_page=100&purchase_type=all"
    if day_range: base_url += f"&day_range={day_range}"
        
    cursor = "*"
    for _ in range(3): # 언어당 최대 300개까지만 탐색
        try:
            res = requests.get(base_url + f"&cursor={urllib.parse.quote(cursor)}")
            res.raise_for_status()
            data = res.json()
            if not data.get('reviews'): break
            for r in data['reviews']:
                reviews.append({
                    "language": lang, 
                    "is_positive": r['voted_up'],
                    "playtime": round(r['author'].get('playtime_at_review', 0) / 60, 1),
                    "steam_id": str(r['author'].get('steamid', '익명'))[-4:],
                    "review": r['review'][:400].replace('\n', ' ').encode('utf-8', 'ignore').decode('utf-8')
                })
            cursor = data.get('cursor', '*')
            if not cursor: break
        except: break
    return reviews

def fetch_steam_reviews(app_id, recent_days_val):
    total_lang_counts = {}
    all_time_total_reviews = 0
    
    # 1. 전체 언어별 리뷰 수 파악
    for lang in LANG_MAP.keys():
        try:
            res = requests.get(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all")
            count = res.json().get('query_summary', {}).get('total_reviews', 0)
            if count > 0:
                total_lang_counts[lang] = count
                all_time_total_reviews += count
        except: pass
            
    # 2. 전체 누적 평점 요약 가져오기
    summary_all = requests.get(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=all").json().get('query_summary', {})
    
    # 3. 최근 동향 평점 요약 가져오기 (정확한 수치 계산용)
    recent_custom_desc = "평가 없음"
    recent_total = 0
    if recent_days_val:
        try:
            res_recent = requests.get(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&day_range={recent_days_val}&num_per_page=1&purchase_type=all").json()
            recent_summary = res_recent.get('query_summary', {})
            recent_total = recent_summary.get('total_reviews', 0)
            recent_pos = recent_summary.get('total_positive', 0)
            if recent_total > 0:
                recent_custom_desc = calculate_custom_score(recent_pos / recent_total, recent_total)
        except: pass
    else:
        recent_total = summary_all.get('total_reviews', 0)
        recent_pos = summary_all.get('total_positive', 0)
        if recent_total > 0:
            recent_custom_desc = calculate_custom_score(recent_pos / recent_total, recent_total)

    # 4. 분석할 TOP 3 언어 + 한국어 선정
    top_langs_keys = [l[0] for l in sorted(total_lang_counts.items(), key=lambda x: x[1], reverse=True)[:3]]
    if "koreana" not in top_langs_keys:
        top_langs_keys.append("koreana")
        
    store_stats = {
        "all_desc": SCORE_MAP.get(summary_all.get('review_score', 0), "평가 없음"),
        "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc,
        "recent_total": recent_total, 
        "total_lang_counts": total_lang_counts 
    }
    
    # 5. 선정된 언어들에 대해서만 정확하게 리뷰 텍스트 수집
    filtered_all = {lang: [] for lang in top_langs_keys}
    filtered_recent = {lang: [] for lang in top_langs_keys}
    
    for lang in top_langs_keys:
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None)
        # AI 토큰 절약을 위해 각 언어별 20개까지만 프롬프트에 담음
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: **{r['steam_id']}] {r['review']}" for r in all_revs][:20]
        
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: **{r['steam_id']}] {r['review']}" for r in rec_revs][:20]
        else:
            filtered_recent[lang] = filtered_all[lang]

    return filtered_all, filtered_recent, store_stats
