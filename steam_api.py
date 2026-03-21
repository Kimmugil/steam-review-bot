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
    headers = {"User-Agent": "Mozilla/5.0"}
    cookies = {"birthtime": "0", "lastagecheckage": "1-0-1900", "wants_mature_content": "1"}
    try:
        res = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        res.raise_for_status()
        html = res.text
        rating_match = re.search(r'<span class="game_review_summary[^>]*>([^<]+)</span>', html)
        return rating_match.group(1).strip() if rating_match else "평가 없음", 0
    except: return None, None

def get_steam_game_info(game_input):
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None
    try:
        res = requests.get(sanitize_url(f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean"), timeout=10)
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
    try:
        res = requests.get(sanitize_url(f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=5&maxlength=3000&format=json"), timeout=5)
        news_items = res.json().get('appnews', {}).get('newsitems', [])
        if not news_items: return None, None, None, None
        def parse_item(item):
            date_str = datetime.fromtimestamp(item.get('date', 0)).strftime('%Y-%m-%d')
            return item['title'], item.get('contents', ''), item['url'], date_str
        for item in news_items:
            if any(kw in item.get('title', '').lower() for kw in ['update', 'patch', '패치', '업데이트']): return parse_item(item)
        return parse_item(news_items[0])
    except: return None, None, None, None

def get_smart_period(release_date):
    days_since = (datetime.now() - release_date).days
    if days_since < 6: return 3, "출시 초기", "출시 직후 민심을 파악하기 위해 최근 3일간의 동향을 분석했습니다."
    elif days_since < 40: return days_since // 2, f"최근 {days_since // 2}일", f"오픈 초기 노이즈를 배제하기 위해 출시일의 절반인 최근 {days_since // 2}일간의 동향을 분석했습니다."
    return 30, "최근 30일", "서비스가 안정화된 상태로 최근 30일간의 장기 동향을 분석했습니다."

def fetch_lang_reviews(app_id, lang, day_range=None):
    reviews = []
    filter_type = "recent" if day_range else "all"
    base_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter={filter_type}&language={lang}&num_per_page=100&purchase_type=all")
    if day_range: base_url += f"&day_range={day_range}"
    cursor = "*"
    for _ in range(3): 
        try:
            res = requests.get(base_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=10).json()
            if not res.get('reviews'): break
            for r in res['reviews']:
                reviews.append({
                    "language": lang, "is_positive": r['voted_up'],
                    "playtime": round(r['author'].get('playtime_at_review', 0) / 60, 1),
                    "steam_id": str(r['author'].get('steamid', '익명'))[-4:],
                    "review": r['review'][:400].replace('\n', ' ')
                })
            cursor = res.get('cursor', '*')
            if not cursor: break
        except: break
    return reviews

def _fetch_single_lang_stats(app_id, lang):
    try:
        res_all = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all"), timeout=5).json().get('query_summary', {})
        return lang, res_all
    except: return lang, {}

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
            summ = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=steam"), timeout=5).json().get('query_summary', {})
            score_code = summ.get('review_score', 0)
            if score_code == 0 and summ.get('total_reviews', 0) > 0: official_desc = calculate_custom_score(summ.get('total_positive', 0) / summ.get('total_reviews', 0), summ.get('total_reviews', 0))
            else: official_desc = SCORE_MAP.get(score_code, "평가 없음")
        except: official_desc = "평가 없음"

    all_desc = calculate_custom_score(sum_pos / sum_total, sum_total) if sum_total > 0 else "평가 없음"
    lang_stats_30_dict = {lang: {'total': 0, 'positive': 0} for lang in LANG_MAP.keys()}
    recent_total, recent_pos = 0, 0
    recent_custom_desc = "평가 없음"

    if recent_days_val:
        cutoff_ts = int((datetime.now() - timedelta(days=recent_days_val)).timestamp())
        sample_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=recent&language=all&num_per_page=100&purchase_type=all")
        cursor = "*"
        for _ in range(50):
            try:
                data = requests.get(sample_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=5).json()
                revs = data.get('reviews', [])
                if not revs: break
                stop_fetching = False
                for r in revs:
                    if r.get('timestamp_created', 0) < cutoff_ts:
                        stop_fetching = True; break 
                    recent_total += 1
                    if r.get('voted_up', False): recent_pos += 1
                    r_lang = r.get('language')
                    if r_lang in lang_stats_30_dict:
                        lang_stats_30_dict[r_lang]['total'] += 1
                        if r.get('voted_up', False): lang_stats_30_dict[r_lang]['positive'] += 1
                if stop_fetching: break
                cursor = data.get('cursor', '*')
                if not cursor: break
            except: break
        if recent_total > 0: recent_custom_desc = calculate_custom_score(recent_pos / recent_total, recent_total)
        lang_stats_30_dict = {k: v for k, v in lang_stats_30_dict.items() if v['total'] > 0}
    else: recent_total, recent_custom_desc = sum_total, all_desc

    # 💡 [핵심] 권역별 분석을 위해 각 권역 대표 언어를 골고루 타겟에 포함시킴
    target_langs = set([l[0] for l in sorted(lang_stats_all_dict.items(), key=lambda x: x[1]['total'], reverse=True)[:3]])
    target_langs.add("koreana")
    for region in ["아시아", "영미/유럽권", "CIS", "중남미", "중동/기타"]:
        langs_in_region = [l for l in lang_stats_all_dict.keys() if REGION_MAP.get(l, '기타') == region]
        if langs_in_region:
            top_lang_in_reg = sorted(langs_in_region, key=lambda x: lang_stats_all_dict[x]['total'], reverse=True)[0]
            target_langs.add(top_lang_in_reg)

    filtered_all, filtered_recent, all_reviews_for_pt = {l: [] for l in target_langs}, {l: [] for l in target_langs}, []
    for lang in target_langs:
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None)
        all_reviews_for_pt.extend([{'pt': r['playtime'], 'pos': r['is_positive']} for r in all_revs])
        
        # 권역 정보를 함께 태워보냄
        reg_name = REGION_MAP.get(lang, "기타")
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | 🌐 {reg_name} | ⏱️ {r['playtime']}h] {r['review']}" for r in all_revs][:20]
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | 🌐 {reg_name} | ⏱️ {r['playtime']}h] {r['review']}" for r in rec_revs][:20]
        else: filtered_recent[lang] = filtered_all[lang]

    # 💡 [업데이트] 플레이타임 3등분 로직 (하위 25%, 중위 50%, 상위 25%)
    all_reviews_for_pt.sort(key=lambda x: x['pt'])
    n_len = len(all_reviews_for_pt)
    if n_len >= 4:
        q1, q3 = n_len // 4, n_len * 3 // 4
        newbies = all_reviews_for_pt[:q1]
        normals = all_reviews_for_pt[q1:q3]
        cores = all_reviews_for_pt[q3:]
    else:
        newbies, normals, cores = all_reviews_for_pt, [], []
    
    def calc_pt_stats(group):
        if not group: return 0, 0, "평가 없음"
        pos = sum(1 for x in group if x['pos'])
        return round(sum(x['pt'] for x in group) / len(group), 1), len(group), calculate_custom_score(pos / len(group), len(group))

    n_avg, n_tot, n_desc = calc_pt_stats(newbies)
    norm_avg, norm_tot, norm_desc = calc_pt_stats(normals)
    c_avg, c_tot, c_desc = calc_pt_stats(cores)

    # 테이블 데이터 빌드 (기존과 동일하므로 생략 없이 축약)
    def build_reg_table(lang_data, total):
        reg_stat = {}
        for l, s in lang_data.items():
            rg = REGION_MAP.get(l, "🌐 기타")
            if rg not in reg_stat: reg_stat[rg] = {"total": 0, "positive": 0}
            reg_stat[rg]["total"] += s["total"]
            reg_stat[rg]["positive"] += s["positive"]
        return [{"rank": f"{i+1}위", "region": rg, "count": s['total'], "ratio": f"{(s['total']/total)*100:.1f}%" if total>0 else "0%", "pos_ratio": f"{(s['positive']/s['total'])*100:.1f}%", "neg_ratio": f"{((s['total']-s['positive'])/s['total'])*100:.1f}%", "eval": calculate_custom_score(s['positive']/s['total'], s['total'])} for i, (rg, s) in enumerate(sorted(reg_stat.items(), key=lambda x: x[1]['total'], reverse=True))]

    def build_lang_table(lang_data, total):
        return [{"rank": f"{i+1}위", "lang": get_lang_name(l).split(" ", 1)[-1].strip(), "lang_with_flag": get_lang_name(l), "count": s['total'], "ratio": f"{(s['total']/total)*100:.1f}%" if total>0 else "0%", "pos_ratio": f"{(s['positive']/s['total'])*100:.1f}%", "neg_ratio": f"{((s['total']-s['positive'])/s['total'])*100:.1f}%", "eval": calculate_custom_score(s['positive']/s['total'], s['total'])} for i, (l, s) in enumerate(sorted(lang_data.items(), key=lambda x: x[1]['total'], reverse=True))]

    store_stats = {
        "official_desc": official_desc, "all_desc": all_desc, "all_total": sum_total,
        "recent_desc": recent_custom_desc, "recent_total": recent_total,
        "table_data_all": build_lang_table(lang_stats_all_dict, sum_total), 
        "table_data_30": build_lang_table(lang_stats_30_dict, sum([v['total'] for v in lang_stats_30_dict.values()])), 
        "table_data_region": build_reg_table(lang_stats_all_dict, sum_total),
        "days_since_release": (datetime.now() - release_date).days,
        "newbie_avg": n_avg, "newbie_total": n_tot, "newbie_desc": n_desc,
        "norm_avg": norm_avg, "norm_total": norm_tot, "norm_desc": norm_desc,
        "core_avg": c_avg, "core_total": c_tot, "core_desc": c_desc
    }
    return filtered_all, filtered_recent, store_stats
