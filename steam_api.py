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

def fetch_store_official_rating(app_id):
    """
    💡 [추가] 스팀 상점 페이지 HTML을 직접 크롤링하여 공식 평점 텍스트와 리뷰 수를 추출합니다.
    API 지연(Caching) 문제를 우회하기 위해 가장 최신 정보를 담고 있는 웹 페이지를 직접 읽습니다.
    """
    url = f"https://store.steampowered.com/app/{app_id}/?l=korean"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    # 성인 인증 및 언어 설정을 위한 쿠키 (birthtime=0으로 연령 제한 우회)
    cookies = {"birthtime": "0", "lastagecheckage": "1-0-1900", "wants_mature_content": "1"}
    
    try:
        res = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        res.raise_for_status()
        html = res.text
        
        # 1. 공식 평점 텍스트 추출 (예: "복합적", "대체로 긍정적")
        # <span class="game_review_summary positive">...</span> 형태 탐색
        rating_match = re.search(r'<span class="game_review_summary[^>]*>([^<]+)</span>', html)
        rating_text = rating_match.group(1).strip() if rating_match else "평가 없음"
        
        # 2. 공식 리뷰 수 추출 (예: "2,466")
        # (2,466개 리뷰) 형태의 텍스트 탐색
        count_match = re.search(r'\((\d{1,3}(?:,\d{3})*)개 리뷰\)', html)
        if not count_match:
            # 영어 환경 등 다른 텍스트 패턴 대비 (예: 2,466 reviews)
            count_match = re.search(r'\((\d{1,3}(?:,\d{3})*)\)', html)
            
        review_count_str = count_match.group(1).replace(",", "") if count_match else "0"
        review_count = int(review_count_str)
        
        return rating_text, review_count
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
        return 3, "출시 초기", "출시된 지 3일이 채 지나지 않은 극초기 신작입니다. 스팀 상점의 공식 평점 갱신이 지연될 수 있으므로, 실시간 유저 리뷰 표본을 직접 수집하여 정확한 초기 민심을 분석했습니다."
    elif days_since < 7: 
        return 3, "최근 3일", "출시 후 1주일이 지나지 않은 신작입니다. 발매 직후의 평가 변동성이 매우 큰 시기이므로, 최신 민심을 정확히 파악하기 위해 최근 3일간의 동향을 집중적으로 분석했습니다."
    elif days_since < 30: 
        return 7, "최근 7일", "출시 후 1달이 채 되지 않은 게임입니다. 초기 '오픈빨'이 빠지고 실제 게임성이 평가받는 시점이므로, 최근 7일간의 리뷰를 통해 안정화 단계의 민심을 확인했습니다."
    return 30, "최근 30일", "출시 후 1달 이상 경과하여 서비스가 안정화된 게임입니다. 현재 시점의 실질적인 유저 여론과 최근 패치/업데이트에 대한 반응을 확인하기 위해 최근 30일간의 장기 동향을 분석했습니다."

def fetch_lang_reviews(app_id, lang, day_range=None):
    reviews = []
    filter_type = "recent" if lang == "all" and day_range else "all"
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
    
    # 1. 언어별 데이터 수집
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

    # 2. 스팀 공식 평점 (💡 API 대신 상점 페이지 스크래핑 우선 적용)
    official_desc, official_total_reviews = fetch_store_official_rating(app_id)
    
    # 만약 스크래핑에 실패하면 기존 API 로직으로 폴백
    if not official_desc or official_desc == "평가 없음":
        try:
            summary_official_res = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=steam"), timeout=5).json()
            summary_official = summary_official_res.get('query_summary', {})
            official_total_reviews = summary_official.get('total_reviews', 0)
            official_score_code = summary_official.get('review_score', 0)
            
            if official_score_code == 0 and official_total_reviews > 0:
                pos = summary_official.get('total_positive', 0)
                official_desc = calculate_custom_score(pos / official_total_reviews, official_total_reviews)
            else:
                official_desc = SCORE_MAP.get(official_score_code, "평가 없음")
        except:
            official_total_reviews = 0
            official_desc = "평가 없음"
            
    # 3. 전체 누적 평점 (외부 키 포함)
    try:
        summary_all_res = requests.get(sanitize_url(f"https://store.steampowered.com/appreviews/{app_id}?json=1&language=all&num_per_page=0&purchase_type=all"), timeout=5).json()
        summary_all = summary_all_res.get('query_summary', {})
        all_time_total_reviews = summary_all.get('total_reviews', 0)
        all_score_code = summary_all.get('review_score', 0)
        
        if all_score_code == 0 and all_time_total_reviews > 0:
            pos = summary_all.get('total_positive', 0)
            all_desc = calculate_custom_score(pos / all_time_total_reviews, all_time_total_reviews)
        else:
            all_desc = SCORE_MAP.get(all_score_code, "평가 없음")
    except:
        all_time_total_reviews = 0
        all_desc = "평가 없음"
    
    # 4. 최근 동향 분석 데이터
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
        recent_custom_desc = all_desc

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
        "official_desc": official_desc,
        "official_total": official_total_reviews,
        "all_desc": all_desc,
        "all_total": all_time_total_reviews,
        "recent_desc": recent_custom_desc,
        "recent_total": recent_total, 
        "total_lang_counts": total_lang_counts,
        "newbie_avg": newbie_avg,
        "core_avg": core_avg
    }

    return filtered_all, filtered_recent, store_stats
