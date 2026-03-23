import requests
import urllib.parse
import re
import concurrent.futures
from datetime import datetime, timedelta
import ui_texts as ui
from config import LANG_MAP, SCORE_MAP, REGION_MAP

def get_lang_name(lang_code):
    return LANG_MAP.get(lang_code, f"🏳️ {lang_code}")

def calculate_custom_score(pos_ratio, total):
    if total == 0: return ui.TEXTS["steam_eval_none"]
    if pos_ratio >= 0.95: return ui.TEXTS["steam_eval_op"]
    elif pos_ratio >= 0.80: return ui.TEXTS["steam_eval_vp"]
    elif pos_ratio >= 0.70: return ui.TEXTS["steam_eval_mp"]
    elif pos_ratio >= 0.40: return ui.TEXTS["steam_eval_mixed"]
    elif pos_ratio >= 0.20: return ui.TEXTS["steam_eval_mn"]
    elif pos_ratio >= 0.01: return ui.TEXTS["steam_eval_vn"]
    return ui.TEXTS["steam_eval_on"]

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
        return rating_match.group(1).strip() if rating_match else ui.TEXTS["steam_eval_none"], 0
    except: return None, None

def get_steam_game_info(game_input):
    app_id = str(game_input).strip()
    if not app_id.isdigit(): return None, None, None, None
    try:
        res = requests.get(sanitize_url(f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=korean"), timeout=10)
        data = res.json()
        if not data or app_id not in data or not data[app_id]['success']: return None, None, None, None
        game_data = data[app_id]['data']
        exact_name = game_data['name'].encode('utf-8', 'ignore').decode('utf-8')
        header_image = game_data.get('header_image', '')
        try:
            raw_date = game_data['release_date']['date']
            clean_date = re.sub(r'[^\d\s-]', '', raw_date.replace("년 ", "-").replace("월 ", "-").replace("일", ""))
            release_date = datetime.strptime(clean_date.strip(), "%Y-%m-%d")
        except: release_date = datetime(2020, 1, 1)
        return app_id, exact_name, release_date, header_image
    except: return None, None, None, None

def fetch_latest_news(app_id):
    try:
        res = requests.get(sanitize_url(f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={app_id}&count=5&maxlength=3000&format=json"), timeout=5)
        news_items = res.json().get('appnews', {}).get('newsitems', [])
        if not news_items: return None, None, None, None, None

        def parse_item(item):
            date_str = datetime.fromtimestamp(item.get('date', 0)).strftime('%Y-%m-%d')
            contents = item.get('contents', '')
            img_url = None
            img_match_html = re.search(r'<img[^>]+src=["\'](http[^"\']+)["\']', contents, re.IGNORECASE)
            img_match_bb = re.search(r'\[img\](http.*?)\[/img\]', contents, re.IGNORECASE)
            if img_match_html: img_url = img_match_html.group(1)
            elif img_match_bb: img_url = img_match_bb.group(1)
            return item['title'], contents, item['url'], date_str, img_url

        for item in news_items:
            if any(kw in item.get('title', '').lower() for kw in ['update', 'patch', '패치', '업데이트']): return parse_item(item)
        return parse_item(news_items[0])
    except: return None, None, None, None, None

def get_smart_period(release_date):
    now = datetime.now()
    days_since = (now - release_date).days
    if days_since < 6:
        days = 3
        label = ui.TEXTS["steam_period_early"]
        reason = ui.TEXTS["steam_period_early_desc"]
    elif days_since < 40:
        days = days_since // 2
        label = ui.TEXTS["steam_period_mid"].format(days)
        reason = ui.TEXTS["steam_period_mid_desc"]
    else:
        days = 30
        label = ui.TEXTS["steam_period_long"]
        reason = ui.TEXTS["steam_period_long_desc"]
    start_date = now - timedelta(days=days)
    period_str = f"{start_date.strftime('%Y.%m.%d')} ~ {now.strftime('%Y.%m.%d')}"
    return days, label, reason, period_str

def fetch_lang_reviews(app_id, lang, day_range=None, limit=40):
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
    return reviews[:limit]

def _fetch_single_lang_stats(app_id, lang):
    try:
        res_all = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language={lang}&num_per_page=0&purchase_type=all"), timeout=5).json().get('query_summary', {})
        return lang, res_all
    except: return lang, {}

def fetch_steam_reviews(app_id, recent_days_val, release_date, period_str):
    # ── 1차: 전체 30개 언어 통계 병렬 수집 ──────────────────────────────
    # 이것이 글로벌 통계표, 권역 통계, 언어별 순위의 기반이 되는 데이터
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
    if not official_desc or official_desc == ui.TEXTS["steam_eval_none"]:
        try:
            summ = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=steam"), timeout=5).json().get('query_summary', {})
            score_code = summ.get('review_score', 0)
            if score_code == 0 and summ.get('total_reviews', 0) > 0:
                official_desc = calculate_custom_score(summ.get('total_positive', 0) / summ.get('total_reviews', 0), summ.get('total_reviews', 0))
            else:
                official_desc = SCORE_MAP.get(score_code, ui.TEXTS["steam_eval_none"])
        except: official_desc = ui.TEXTS["steam_eval_none"]

    all_desc = calculate_custom_score(sum_pos / sum_total, sum_total) if sum_total > 0 else ui.TEXTS["steam_eval_none"]

    # ── 최근 기간 통계 수집 ───────────────────────────────────────────────
    lang_stats_30_dict = {lang: {'total': 0, 'positive': 0} for lang in LANG_MAP.keys()}
    recent_total, recent_pos = 0, 0
    recent_custom_desc = ui.TEXTS["steam_eval_none"]
    days_since_release = (datetime.now() - release_date).days

    if recent_days_val:
        # ── [3번 수정] 출시 4일 미만: 가장 최근 리뷰의 30%만 수집 ──────
        if days_since_release < 4:
            # 최신순으로 최대 500개만 가져온 뒤 30%만 사용
            sample_url = sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&filter=recent&language=all&num_per_page=100&purchase_type=all")
            cursor = "*"
            raw_reviews = []
            for _ in range(5):   # 최대 500개 수집
                try:
                    data = requests.get(sample_url + f"&cursor={urllib.parse.quote(cursor)}", timeout=5).json()
                    revs = data.get('reviews', [])
                    if not revs: break
                    raw_reviews.extend(revs)
                    cursor = data.get('cursor', '*')
                    if not cursor: break
                except: break
            # 30%만 사용
            cutoff_count = max(1, int(len(raw_reviews) * 0.3))
            for r in raw_reviews[:cutoff_count]:
                recent_total += 1
                if r.get('voted_up', False): recent_pos += 1
                r_lang = r.get('language')
                if r_lang in lang_stats_30_dict:
                    lang_stats_30_dict[r_lang]['total'] += 1
                    if r.get('voted_up', False): lang_stats_30_dict[r_lang]['positive'] += 1
        else:
            # 기존 방식: 타임스탬프 컷오프
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
    else:
        recent_total, recent_custom_desc = sum_total, all_desc

    # ── 2차: 글로벌 통계표 빌드 (전체 30개 언어 통계 기반) ───────────────
    # 이 단계가 먼저 완성되어야 아래 언어 선정의 근거가 됨

    def build_reg_table(lang_data, total):
        reg_stat = {}
        for l, s in lang_data.items():
            rg = REGION_MAP.get(l, f"🌐 {ui.TEXTS['steam_etc']}")
            if rg not in reg_stat: reg_stat[rg] = {"total": 0, "positive": 0}
            reg_stat[rg]["total"] += s["total"]
            reg_stat[rg]["positive"] += s["positive"]
        return [{"rank": f"{i+1}위", "region": rg, "count": s['total'],
                 "ratio": f"{(s['total']/total)*100:.1f}%" if total > 0 else "0%",
                 "pos_ratio": f"{(s['positive']/s['total'])*100:.1f}%",
                 "neg_ratio": f"{((s['total']-s['positive'])/s['total'])*100:.1f}%",
                 "eval": calculate_custom_score(s['positive']/s['total'], s['total'])}
                for i, (rg, s) in enumerate(sorted(reg_stat.items(), key=lambda x: x[1]['total'], reverse=True))]

    def build_lang_table(lang_data, total):
        return [{"rank": f"{i+1}위",
                 "lang": get_lang_name(l).split(" ", 1)[-1].strip(),
                 "lang_with_flag": get_lang_name(l),
                 "count": s['total'],
                 "ratio": f"{(s['total']/total)*100:.1f}%" if total > 0 else "0%",
                 "pos_ratio": f"{(s['positive']/s['total'])*100:.1f}%",
                 "neg_ratio": f"{((s['total']-s['positive'])/s['total'])*100:.1f}%",
                 "eval": calculate_custom_score(s['positive']/s['total'], s['total'])}
                for i, (l, s) in enumerate(sorted(lang_data.items(), key=lambda x: x[1]['total'], reverse=True))]

    table_data_all = build_lang_table(lang_stats_all_dict, sum_total)

    # ── [4번 수정] 언어 선정 로직 재설계 ─────────────────────────────────
    # 3차: 권역별 세부 평가용 → 각 권역의 대표 언어 1개 (리뷰 원문 20개)
    # 4차: 국가별 원문 분석용 → 누적 TOP3 + koreana (중복 시 3개), 리뷰 원문 40개

    # 4차 대상: table_data_all(전체 통계)에서 이미 순위가 매겨진 결과 활용
    # 최소 표본 기준: 전체의 1% 이상 또는 최소 10개 이상 언어만 대상
    min_review_threshold = max(10, int(sum_total * 0.01))
    ranked_langs = [r['lang_with_flag'] for r in table_data_all
                    if next((s['total'] for l, s in lang_stats_all_dict.items()
                             if get_lang_name(l) == r['lang_with_flag']), 0) >= min_review_threshold]
    # lang_with_flag → lang_code 역매핑
    flag_to_code = {get_lang_name(l): l for l in lang_stats_all_dict.keys()}

    # 누적 TOP3 언어 코드 (순위대로)
    top3_lang_codes = []
    for flag_name in [r['lang_with_flag'] for r in table_data_all]:
        code = flag_to_code.get(flag_name)
        if code and code in lang_stats_all_dict:
            top3_lang_codes.append(code)
        if len(top3_lang_codes) >= 3:
            break

    # country_analysis 대상: TOP3 + koreana (순서 보장, 중복 제거)
    country_langs_ordered = []
    for code in top3_lang_codes:
        if code not in country_langs_ordered:
            country_langs_ordered.append(code)
    if "koreana" not in country_langs_ordered:
        country_langs_ordered.append("koreana")

    # region_analysis 대상: 각 권역별 리뷰 수 1위 언어 (권역 커버리지 확보)
    region_langs = set()
    for region_prefix in ["아시아", "영미/유럽권", "CIS", "중남미", "중동/기타"]:
        langs_in_region = [l for l in lang_stats_all_dict.keys() if region_prefix in REGION_MAP.get(l, '')]
        if langs_in_region:
            top_lang = sorted(langs_in_region, key=lambda x: lang_stats_all_dict[x]['total'], reverse=True)[0]
            region_langs.add(top_lang)

    # 리뷰 원문 수집
    # country_langs: 40개씩 (상세 원문 분석용)
    # region_langs: 20개씩 (권역 트렌드 파악용, country와 겹치는 언어는 40개 유지)
    all_fetch_langs = set(country_langs_ordered) | region_langs
    filtered_all = {}
    filtered_recent = {}
    all_reviews_for_pt = []

    for lang in all_fetch_langs:
        fetch_limit = 40 if lang in country_langs_ordered else 20
        all_revs = fetch_lang_reviews(app_id, lang, day_range=None, limit=fetch_limit)
        all_reviews_for_pt.extend([{'pt': r['playtime'], 'pos': r['is_positive']} for r in all_revs])
        lang_label = get_lang_name(lang)
        filtered_all[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | 🌐 {lang_label} | ⏱️ {r['playtime']}h] {r['review']}"
                               for r in all_revs]
        if recent_days_val:
            rec_revs = fetch_lang_reviews(app_id, lang, day_range=recent_days_val, limit=fetch_limit)
            filtered_recent[lang] = [f"[{'👍' if r['is_positive'] else '👎'} | 🌐 {lang_label} | ⏱️ {r['playtime']}h] {r['review']}"
                                     for r in rec_revs]
        else:
            filtered_recent[lang] = filtered_all[lang]

    # 플레이타임 분석
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
        if not group: return 0, 0, ui.TEXTS["steam_eval_none"]
        pos = sum(1 for x in group if x['pos'])
        return round(sum(x['pt'] for x in group) / len(group), 1), len(group), calculate_custom_score(pos / len(group), len(group))

    n_avg, n_tot, n_desc = calc_pt_stats(newbies)
    norm_avg, norm_tot, norm_desc = calc_pt_stats(normals)
    c_avg, c_tot, c_desc = calc_pt_stats(cores)

    store_stats = {
        "official_desc": official_desc, "all_desc": all_desc, "all_total": sum_total,
        "recent_desc": recent_custom_desc, "recent_total": recent_total,
        "table_data_all": table_data_all,
        "table_data_30": build_lang_table(lang_stats_30_dict, sum([v['total'] for v in lang_stats_30_dict.values()])),
        "table_data_region": build_reg_table(lang_stats_all_dict, sum_total),
        "days_since_release": days_since_release,
        "newbie_avg": n_avg, "newbie_total": n_tot, "newbie_desc": n_desc,
        "norm_avg": norm_avg, "norm_total": norm_tot, "norm_desc": norm_desc,
        "core_avg": c_avg, "core_total": c_tot, "core_desc": c_desc,
        "collection_period": period_str,
        # country_langs_ordered: AI 프롬프트에서 순서 보장용으로 전달
        "country_langs_ordered": country_langs_ordered,
    }
    return filtered_all, filtered_recent, store_stats
