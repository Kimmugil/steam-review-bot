import requests
import urllib.parse
import re
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

def sanitize_url(url):
    return "".join(char for char in url if 32 <= ord(char) <= 126).strip()

def get_steam_game_info(game_input):
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None
    
    details_url = sanitize_url(f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean")
    
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
            clean_date = re.sub(r'[^\d\s-]', '', raw_date.replace("년 ", "-").replace("월 ", "-").replace("일", ""))
            release_date = datetime.strptime(clean_date.strip(), "%Y-%m-%d")
        except: 
            release_date = datetime(2020, 1, 1)
            
        return app_id, exact_name, release_date
    except:
        return None, None, None

def fetch_latest_news(app_id):
    url = sanitize_url(f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=5&maxlength=3000&format=json")
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
    if days_since < 3: 
        return None, "전체 누적", "출시된 지 3일이 채 지나지 않은 극초기 신작이므로, 특정 기간을 나누지 않고 전체 누적 리뷰를 바탕으로 유저 반응을 종합 분석했습니다."
    elif days_since < 7: 
        return 3, "최근 3일", "출시 후 1주일이 지나지 않은 신작입니다. 발매 직후의 평가 변동성이 매우 큰 시기이므로, 최신 민심을 정확히 파악하기 위해 최근 3일간의 동향을 집중적으로 분석했습니다."
    elif days_since < 30: 
        return 7, "최근 7일", "출시 후 1달이 채 되지 않은 게임입니다. 초기 '오픈빨'이 빠지고 실제 게임성이 평가받는 시점이므로, 최근 7일간의 리뷰를 통해 안정화 단계의 민심을 확인했습니다."
    return 30, "최근 30일", "출시 후 1달 이상 경과하여 서비스가 안정화된 게임입니다. 현재 시점의 실질적인 유저 여론과 최근 패치/업데이트에 대한 반응을 확인하기 위해 최근 30일간의 장기 동향을 분석했습니다."

def fetch_lang_reviews(app_id, lang, day_range=None):
    reviews = []
    filter_type = "recent" if day_range else "all"
    base_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter={filter_type}&language={lang}&num_per_page=100&purchase_type=all")
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
    
    # 💡 [개선] 각 언어별 전체/긍정/부정 리뷰 수를 모두 딕셔너리로 저장
    for lang in LANG_MAP.keys():
        try:
            res_all = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all"), timeout=5)
            all_data = res_all.json().get('query_summary', {})
            t_revs = all_data.get('total_reviews', 0)
            p_revs = all_data.get('total_positive', 0)
            n_revs = all_data.get('total_negative', 0)
            if t_revs > 0:
                total_lang_counts[lang] = {"total": t_revs, "positive": p_revs, "negative": n_revs}
        except: pass
            
    summary_all_res = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=all")).json()
    summary_all = summary_all_res.get('query_summary', {})
    all_time_total_reviews = summary_all.get('total_reviews', 0)
    
    recent_total = 0
    recent_custom_desc = "평가 없음"

    if recent_days_val:
        sample_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=recent&language=all&day_range={recent_days_val}&num_per_page=100&purchase_type=all")
        cursor = "*"
        pos_count = 0
        for _ in range(5):
            try:
                res = requests.get(sample_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=5)
                data = res.json()
                revs = data.get('reviews', [])
                if not revs: break
                for r in revs:
                    if r.get('voted_up'): pos_count += 1
                    recent_total += 1
                cursor = data.get('cursor', '*')
                if not cursor: break
            except: break
        
        if recent_total > 0:
            recent_custom_desc = calculate_custom_score(pos_count / recent_total, recent_total)
    else:
        recent_total = all_time_total_reviews
        recent_custom_desc = SCORE_MAP.get(summary_all.get('review_score', 0), "평가 없음")

    # 💡 [수정] 딕셔너리 구조 변경에 따른 정렬 기준 업데이트
    top_langs_keys = [l[0] for l in sorted(total_lang_counts.items(), key=lambda x: x[1]['total'], reverse=True)[:3]]
    if "koreana" not in top_langs_keys:
        top_langs_keys.append("koreana")
        
    filtered_all = {lang: [] for lang in top_langs_keys}
    filtered_recent = {lang: [] for lang in top_langs_keys}
    all_playtimes = []
    
    for lang in top_langs_keys:
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None)
        all_playtimes.extend([r['playtime'] for r in all_revs])
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: {r['steam_id']}] {r['review']}" for r in all_revs][:20]
        
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: {r['steam_id']}] {r['review']}" for r in rec_revs][:20]
        else:
            filtered_recent[lang] = filtered_all[lang]

    newbie_avg, core_avg = 0, 0
    if all_playtimes:
        all_playtimes.sort()
        mid = len(all_playtimes) // 2
        newbies, cores = all_playtimes[:mid], all_playtimes[mid:]
        newbie_avg = round(sum(newbies) / len(newbies), 1) if newbies else 0
        core_avg = round(sum(cores) / len(cores), 1) if cores else 0

    store_stats = {
        "all_desc": SCORE_MAP.get(summary_all.get('review_score', 0), "평가 없음"),
        "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc,
        "recent_total": recent_total, 
        "total_lang_counts": total_lang_counts,
        "newbie_avg": newbie_avg,
        "core_avg": core_avg
    }

    return filtered_all, filtered_recent, store_stats
