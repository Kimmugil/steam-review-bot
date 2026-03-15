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
    # 앞뒤 공백 및 보이지 않는 문자 제거
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None
    
    # 💡 [버그 픽스] URL 생성 시 한 번 더 검증하여 Connection Adapter 에러 방지
    details_url = f"[https://store.steampowered.com/api/appdetails?appids=](https://store.steampowered.com/api/appdetails?appids=){app_id}&l=korean".strip()
    
    try:
        res = requests.get(details_url, timeout=10)
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
    except Exception as e:
        # 에러 발생 시 로그 확인을 위해 에러 출력
        print(f"Error fetching game info: {e}")
        return None, None, None

def fetch_latest_news(app_id):
    url = f"[https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=](https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=){app_id}&count=5&maxlength=3000&format=json".strip()
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
            if any(kw in title_lower for kw in ['update', 'patch', '패치', '업데이트']):
                return parse_item(item)
        
        return parse_item(news_items[0])
    except: pass
    return None, None, None, None

def get_smart_period(release_date):
    days_since = (datetime.now() - release_date).days
    if days_since < 3: return None, "전체 주요 동향", "초기 데이터 기반 분석"
    elif days_since < 7: return 3, "최근 3일 동향", "출시 초기 집중 분석"
    elif days_since < 30: return 7, "최근 7일 동향", "신작 초기 안정화 분석"
    return 30, "최근 30일 동향", "장기 운영 안정성 분석"

def fetch_lang_reviews(app_id, lang, day_range=None):
    reviews = []
    base_url = f"[https://store.steampowered.com/appreviews/](https://store.steampowered.com/appreviews/){app_id}?json=1&filter=all&language={lang}&num_per_page=100&purchase_type=all".strip()
    if day_range: base_url += f"&day_range={day_range}"
        
    cursor = "*"
    for _ in range(3): 
        try:
            res = requests.get(base_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=10)
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
    
    for lang in LANG_MAP.keys():
        try:
            res = requests.get(f"[https://store.steampowered.com/appreviews/](https://store.steampowered.com/appreviews/){app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all".strip(), timeout=5)
            count = res.json().get('query_summary', {}).get('total_reviews', 0)
            if count > 0:
                total_lang_counts[lang] = count
                all_time_total_reviews += count
        except: pass
            
    summary_all = requests.get(f"[https://store.steampowered.com/appreviews/](https://store.steampowered.com/appreviews/){app_id}?json=1&language=all&num_per_page=0&purchase_type=all".strip()).json().get('query_summary', {})
    
    recent_custom_desc = "평가 없음"
    recent_total = 0
    if recent_days_val:
        try:
            res_recent = requests.get(f"[https://store.steampowered.com/appreviews/](https://store.steampowered.com/appreviews/){app_id}?json=1&language=all&day_range={recent_days_val}&num_per_page=1&purchase_type=all".strip()).json()
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
    
    filtered_all = {lang: [] for lang in top_langs_keys}
    filtered_recent = {lang: [] for lang in top_langs_keys}
    
    for lang in top_langs_keys:
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None)
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: **{r['steam_id']}] {r['review']}" for r in all_revs][:20]
        
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: **{r['steam_id']}] {r['review']}" for r in rec_revs][:20]
        else:
            filtered_recent[lang] = filtered_all[lang]

    return filtered_all, filtered_recent, store_stats
