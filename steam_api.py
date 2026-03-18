import requests
import urllib.parse
import re
import concurrent.futures
from datetime import datetime, timedelta
from config import LANG_MAP, SCORE_MAP, REGION_MAP

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

def fetch_store_official_rating(app_id):
    url = f"https://store.steampowered.com/app/{app_id}/?l=korean"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
    cookies = {"birthtime": "0", "lastagecheckage": "1-0-1900", "wants_mature_content": "1"}
    try:
        res = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        res.raise_for_status()
        html = res.text
        rating_match = re.search(r'<span class="game_review_summary[^>]*>([^<]+)</span>', html)
        rating_text = rating_match.group(1).strip() if rating_match else "평가 없음"
        return rating_text, 0
    except Exception:
        return None, None

def get_steam_game_info(game_input):
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None
    details_url = sanitize_url(f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean")
    try:
        res = requests.get(details_url, timeout=10)
        res.raise_for_status()
        data = res.json()
        if not data or app_id not in data or not data[app_id]['success']: return None, None, None
        game_data = data[app_id]['data']
        exact_name = game_data['name'].encode('utf-8', 'ignore').decode('utf-8')
        try: 
            raw_date = game_data['release_date']['date']
            clean_date = re.sub(r'[^\d\s-]', '', raw_date.replace("년 ", "-").replace("월 ", "-").replace("일", ""))
            release_date = datetime.strptime(clean_date.strip(), "%Y-%m-%d")
        except: release_date = datetime(2020, 1, 1)
        return app_id, exact_name, release_date
    except: return None, None, None

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
            if any(kw in title_lower for kw in ['update', 'patch', '패치', '업데이트']): return parse_item(item)
        return parse_item(news_items[0])
    except: pass
    return None, None, None, None

# 💡 [핵심 픽스] 출시일 기준 절반 자르기 동적 계산 로직 반영
def get_smart_period(release_date):
    days_since = (datetime.now() - release_date).days
    if days_since < 6: 
        return 3, "출시 초기", "출시된 지 며칠 지나지 않은 극초기 신작입니다. 발매 직후의 평가 변동성이 매우 큰 시기이므로, 최신 민심을 파악하기 위해 최소 기준인 최근 3일간의 동향을 분석했습니다."
    elif days_since < 40: 
        target_days = days_since // 2
        return target_days, f"최근 {target_days}일", f"출시 후 40일이 경과하지 않은 신작입니다. 오픈 초기의 거품이나 기술적 이슈가 걷힌 후의 실제 민심을 확인하기 위해, 전체 서비스 기간의 절반인 최근 {target_days}일간의 동향을 집중적으로 분석했습니다."
    return 30, "최근 30일", "출시 후 일정 기간 이상 경과하여 서비스가 안정화된 게임입니다. 현재 시점의 실질적인 유저 여론과 최근 패치/업데이트에 대한 반응을 확인하기 위해 최근 30일간의 장기 동향을 분석했습니다."

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
                    "language": lang, "is_positive": r['voted_up'],
                    "playtime": round(r['author'].get('playtime_at_review', 0) / 60, 1),
                    "steam_id": str(r['author'].get('steamid', '익명'))[-4:],
                    "review": r['review'][:400].replace('\n', ' ').encode('utf-8', 'ignore').decode('utf-8')
                })
            cursor = data.get('cursor', '*')
            if not cursor: break
        except: break
    return reviews

def _fetch_single_lang_stats(app_id, lang):
    try:
        url_all = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all")
        res_all = requests.get(url_all, timeout=5).json().get('query_summary', {})
        return lang, res_all
    except:
        return lang, {}

def _build_region_table_data(lang_data_dict, total_all_reviews):
    region_stats = {}
    for lang_code, stats in lang_data_dict.items():
        region = REGION_MAP.get(lang_code, "🌐 기타")
        if region not in region_stats:
            region_stats[region] = {"total": 0, "positive": 0}
        region_stats[region]["total"] += stats["total"]
        region_stats[region]["positive"] += stats["positive"]
    
    sorted_regions = sorted(region_stats.items(), key=lambda x: x[1]['total'], reverse=True)
    table_data = []
    for idx, (region_name, stats) in enumerate(sorted_regions):
        count = stats['total']
        pos = stats['positive']
        neg = count - pos
        ratio = (count / total_all_reviews) * 100 if total_all_reviews > 0 else 0
        pos_ratio = (pos / count) * 100 if count > 0 else 0
        neg_ratio = (neg / count) * 100 if count > 0 else 0
        eval_desc = calculate_custom_score(pos / count if count > 0 else 0, count)
        
        table_data.append({
            "rank": f"{idx+1}위", "region": region_name, "count": count, 
            "ratio": f"{ratio:.1f}%", "pos_ratio": f"{pos_ratio:.1f}%", "neg_ratio": f"{neg_ratio:.1f}%", "eval": eval_desc
        })
    return table_data

def _build_lang_table_data(lang_data_dict, total_all_reviews):
    sorted_langs = sorted(lang_data_dict.items(), key=lambda x: x[1]['total'], reverse=True)
    table_data = []
    for idx, (lang_code, stats) in enumerate(sorted_langs):
        count, pos = stats['total'], stats['positive']
        neg = stats['total'] - stats['positive']
        ratio = (count / total_all_reviews) * 100 if total_all_reviews > 0 else 0
        pos_ratio = (pos / count) * 100 if count > 0 else 0
        neg_ratio = (neg / count) * 100 if count > 0 else 0
        eval_desc = calculate_custom_score(pos / count if count > 0 else 0, count)
        
        raw_lang = get_lang_name(lang_code)
        clean_lang = raw_lang.split(" ", 1)[-1].strip() if " " in raw_lang else raw_lang
        
        table_data.append({
            "rank": f"{idx+1}위", "lang": clean_lang, "lang_with_flag": raw_lang, "count": count, 
            "ratio": f"{ratio:.1f}%", "pos_ratio": f"{pos_ratio:.1f}%", "neg_ratio": f"{neg_ratio:.1f}%", "eval": eval_desc
        })
    return table_data

def fetch_steam_reviews(app_id, recent_days_val, release_date):
    lang_stats_all_dict = {}
    sum_total, sum_pos = 0, 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(_fetch_single_lang_stats, app_id, lang) for lang in LANG_MAP.keys()]
        for future in concurrent.futures.as_completed(futures):
            lang, summ_all = future.result()
            t_all, p_all = summ_all.get('total_reviews', 0), summ_all.get('total_positive', 0)
            if t_all > 0:
                lang_stats_all_dict[lang] = {"total": t_all, "positive": p_all}
                sum_total += t_all
                sum_pos += p_all

    official_desc, _ = fetch_store_official_rating(app_id)
    if not official_desc or official_desc == "평가 없음":
        try:
            res_steam = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=steam"), timeout=5).json()
            summ = res_steam.get('query_summary', {})
            score_code = summ.get('review_score', 0)
            if score_code == 0 and summ.get('total_reviews', 0) > 0:
                official_desc = calculate_custom_score(summ.get('total_positive', 0) / summ.get('total_reviews', 0), summ.get('total_reviews', 0))
            else: official_desc = SCORE_MAP.get(score_code, "평가 없음")
        except: official_desc = "평가 없음"

    all_time_total_reviews = sum_total
    all_desc = calculate_custom_score(sum_pos / sum_total, sum_total) if sum_total > 0 else "평가 없음"
    
    lang_stats_30_dict = {lang: {'total': 0, 'positive': 0} for lang in LANG_MAP.keys()}
    recent_total, recent_pos = 0, 0
    recent_custom_desc = "평가 없음"

    if recent_days_val:
        cutoff_date = datetime.now() - timedelta(days=recent_days_val)
        cutoff_ts = int(cutoff_date.timestamp())
        
        sample_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=recent&language=all&num_per_page=100&purchase_type=all")
        cursor = "*"
        
        for _ in range(50):
            try:
                res = requests.get(sample_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=5)
                data = res.json()
                revs = data.get('reviews', [])
                if not revs: break
                
                stop_fetching = False
                for r in revs:
                    if r.get('timestamp_created', 0) < cutoff_ts:
                        stop_fetching = True
                        break 
                        
                    recent_total += 1
                    is_pos = r.get('voted_up', False)
                    if is_pos: recent_pos += 1
                    
                    r_lang = r.get('language')
                    if r_lang in lang_stats_30_dict:
                        lang_stats_30_dict[r_lang]['total'] += 1
                        if is_pos: lang_stats_30_dict[r_lang]['positive'] += 1
                            
                if stop_fetching: break
                    
                cursor = data.get('cursor', '*')
                if not cursor: break
            except: break
            
        if recent_total > 0: 
            recent_custom_desc = calculate_custom_score(recent_pos / recent_total, recent_total)
        
        lang_stats_30_dict = {k: v for k, v in lang_stats_30_dict.items() if v['total'] > 0}
    else:
        recent_total, recent_custom_desc = all_time_total_reviews, all_desc

    table_data_all = _build_lang_table_data(lang_stats_all_dict, sum_total)
    table_data_30 = _build_lang_table_data(lang_stats_30_dict, sum([v['total'] for v in lang_stats_30_dict.values()]))
    table_data_region = _build_region_table_data(lang_stats_all_dict, sum_total)
    days_since_release = (datetime.now() - release_date).days

    top_langs_keys = [l[0] for l in sorted(lang_stats_all_dict.items(), key=lambda x: x[1]['total'], reverse=True)[:3]]
    if "koreana" not in top_langs_keys: top_langs_keys.append("koreana")
    
    filtered_all, filtered_recent, all_reviews_for_pt = {l: [] for l in top_langs_keys}, {l: [] for l in top_langs_keys}, []
    for lang in top_langs_keys:
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None)
        all_reviews_for_pt.extend([{'pt': r['playtime'], 'pos': r['is_positive']} for r in all_revs])
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: {r['steam_id']}] {r['review']}" for r in all_revs][:20]
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | ⏱️ {r['playtime']}h | ID: {r['steam_id']}] {r['review']}" for r in rec_revs][:20]
        else: filtered_recent[lang] = filtered_all[lang]

    all_reviews_for_pt.sort(key=lambda x: x['pt'])
    n_len = len(all_reviews_for_pt)
    if n_len >= 4:
        q1 = n_len // 4
        q3 = n_len * 3 // 4
        newbies = all_reviews_for_pt[:q1]
        cores = all_reviews_for_pt[q3:]
    else:
        mid = n_len // 2
        newbies = all_reviews_for_pt[:mid]
        cores = all_reviews_for_pt[mid:]
    
    def calc_pt_stats(group):
        if not group: return 0, 0, "평가 없음"
        avg = round(sum(x['pt'] for x in group) / len(group), 1)
        pos = sum(1 for x in group if x['pos'])
        desc = calculate_custom_score(pos / len(group), len(group))
        return avg, len(group), desc

    n_avg, n_tot, n_desc = calc_pt_stats(newbies)
    c_avg, c_tot, c_desc = calc_pt_stats(cores)

    store_stats = {
        "official_desc": official_desc, "all_desc": all_desc, "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc, "recent_total": recent_total, 
        "total_lang_counts": lang_stats_all_dict,
        "table_data_all": table_data_all, "table_data_30": table_data_30, "table_data_region": table_data_region,
        "days_since_release": days_since_release,
        "newbie_avg": n_avg, "newbie_total": n_tot, "newbie_desc": n_desc,
        "core_avg": c_avg, "core_total": c_tot, "core_desc": c_desc
    }
    return filtered_all, filtered_recent, store_stats
