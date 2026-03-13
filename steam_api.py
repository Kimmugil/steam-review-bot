# steam_api.py
import requests
import urllib.parse
from datetime import datetime
from config import LANG_MAP, SCORE_MAP

def get_steam_info(aid_in):
    aid = str(aid_in).strip()
    if not aid.isdigit(): return None, None, None
    try:
        res = requests.get(f"https://store.steampowered.com/api/appdetails?appids={aid}&l=korean").json()
        if not res or aid not in res or not res[aid]['success']: return None, None, None
        data = res[aid]['data']
        try: rd = datetime.strptime(data['release_date']['date'].replace("년 ","-").replace("월 ","-").replace("일",""), "%Y-%m-%d")
        except: rd = datetime(2024, 1, 1)
        return aid, data['name'], rd
    except: return None, None, None

def fetch_news(aid):
    try:
        res = requests.get(f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={aid}&count=3&maxlength=2000&format=json").json()
        items = res.get('appnews', {}).get('newsitems', [])
        if not items: return None
        for i in items:
            if any(k in i.get('title', '').lower() for k in ['update', 'patch', '패치', '업데이트']):
                return i['title'], i.get('contents', ''), i['url'], datetime.fromtimestamp(i.get('date', 0)).strftime('%Y-%m-%d')
        return items[0]['title'], items[0].get('contents', ''), items[0]['url'], datetime.fromtimestamp(items[0].get('date', 0)).strftime('%Y-%m-%d')
    except: return None

def fetch_revs(aid, day_range=None):
    revs, pos = [], 0
    url = f"https://store.steampowered.com/appreviews/{aid}?json=1&filter=all&language=all&num_per_page=100&purchase_type=all"
    if day_range: url += f"&day_range={day_range}"
    cur = "*"
    for _ in range(5):
        try:
            res = requests.get(url + f"&cursor={urllib.parse.quote(cur)}").json()
            if not res.get('reviews'): break
            for r in res['reviews']:
                revs.append({"lang": r['language'], "pos": r['voted_up'], "time": round(r['author'].get('playtime_at_review', 0)/60, 1), "text": r['review'][:300].replace('\n',' ')})
                if r['voted_up']: pos += 1
            cur = res.get('cursor', '*')
        except: break
    return revs, pos

def get_full_data(aid):
    ra, _ = fetch_revs(aid); rr, _ = fetch_revs(aid, 30)
    l_cnt = {}
    for r in ra: l_cnt[r['lang']] = l_cnt.get(r['lang'], 0) + 1
    top = [l[0] for l in sorted(l_cnt.items(), key=lambda x:x[1], reverse=True)[:3]]
    if "koreana" not in top and "koreana" in l_cnt: top.append("koreana")
    
    def filt(rl):
        f = {l: [] for l in top}
        for r in rl:
            if r['lang'] in top and len(f[r['lang']]) < 10: 
                f[r['lang']].append(f"[{'👍' if r['pos'] else '👎'}|⏱️{r['time']}h] {r['text']}")
        return f
    
    s_all = requests.get(f"https://store.steampowered.com/appreviews/{aid}?json=1&language=all&num_per_page=0&purchase_type=all").json().get('query_summary', {})
    desc = SCORE_MAP.get(s_all.get('review_score', 0), "평가 없음")
    
    return filt(ra), filt(rr), {"all_desc": desc, "all_total": len(ra), "recent_total": len(rr), "total_lang_counts": l_cnt}