import streamlit as st
import pandas as pd
import re
import ui_texts as ui
from ai_analyzer import ask_followup_question

# ── 유틸 ─────────────────────────────────────────────────────────────────

def strip_md(text):
    return re.sub(r'\*\*', '', str(text))

def get_cat_sort_key(n):
    if "[긍정" in n: return 0
    if "[부정" in n: return 1
    return 2

def sort_sentiments(lines):
    if not isinstance(lines, list): return []
    return sorted(lines, key=lambda l: 0 if "[긍정]" in l else (1 if "[부정]" in l else 2))

def apply_eval_color(val):
    v = str(val)
    return "color: #185FA5" if "긍정" in v else ("color: #A32D2D" if "부정" in v else "color: #888")

def eval_color(val):
    if "긍정" in str(val): return "#185FA5"
    if "부정" in str(val): return "#A32D2D"
    return "rgba(128,128,128,0.8)"

def desc_color(val):
    v = str(val)
    if "긍정" in v: return "#185FA5"
    if "부정" in v: return "#A32D2D"
    return "rgba(128,128,128,0.85)"

def clean_cat(name):
    return strip_md(name.replace("[긍정]","").replace("[부정]","").strip())

def cat_chip(name):
    if "[긍정" in name:
        return '<span style="background:#E6F1FB;color:#0C447C;font-size:12px;font-weight:500;padding:3px 10px;border-radius:999px;margin-right:8px;">긍정</span>'
    if "[부정" in name:
        return '<span style="background:#FCEBEB;color:#791F1F;font-size:12px;font-weight:500;padding:3px 10px;border-radius:999px;margin-right:8px;">부정</span>'
    return ''

def s_html(line):
    line = strip_md(line)
    if "[긍정]" in line:
        body = line.replace("[긍정]","").strip()
        return f'<div style="display:flex;gap:10px;align-items:baseline;margin-bottom:10px;"><span style="background:#E6F1FB;color:#0C447C;font-size:12px;font-weight:500;padding:3px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0;">긍정</span><span style="font-size:16px;line-height:1.65;color:var(--color-text-primary);">{body}</span></div>'
    if "[부정]" in line:
        body = line.replace("[부정]","").strip()
        return f'<div style="display:flex;gap:10px;align-items:baseline;margin-bottom:10px;"><span style="background:#FCEBEB;color:#791F1F;font-size:12px;font-weight:500;padding:3px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0;">부정</span><span style="font-size:16px;line-height:1.65;color:var(--color-text-primary);">{body}</span></div>'
    return f'<div style="font-size:16px;line-height:1.65;margin-bottom:10px;color:var(--color-text-primary);">{line}</div>'

def sec(key):
    text = ui.TEXTS.get(key, key)
    st.markdown(f'<p style="font-size:20px;font-weight:500;color:var(--color-text-primary);margin:2rem 0 0.75rem;">{text}</p>', unsafe_allow_html=True)

def gray_box(title, body_text=None, items=None):
    html = '<div style="background:rgba(128,128,128,0.07);border-radius:10px;padding:1.2rem 1.4rem;margin-bottom:1rem;">'
    if title:
        html += f'<div style="font-size:14px;font-weight:500;margin-bottom:9px;">{title}</div>'
    if body_text:
        html += f'<div style="font-size:16px;line-height:1.7;color:var(--color-text-secondary);">{strip_md(body_text).replace(chr(10),"<br>")}</div>'
    if items:
        html += '<ul style="margin:0;padding-left:20px;">'
        for item in items:
            html += f'<li style="font-size:16px;line-height:1.65;margin-bottom:7px;color:var(--color-text-secondary);">{strip_md(str(item))}</li>'
        html += '</ul>'
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)

def issue_card(text):
    clean = strip_md(text)
    if '：' in clean or ': ' in clean:
        sep = '：' if '：' in clean else ': '
        parts = clean.split(sep, 1)
        title_part = parts[0].strip()
        body_part = parts[1].strip() if len(parts) > 1 else ''
        content = f'<div style="font-size:15px;font-weight:500;color:var(--color-text-primary);margin-bottom:5px;">{title_part}</div><div style="font-size:15px;line-height:1.65;color:var(--color-text-secondary);">{body_part}</div>'
    else:
        content = f'<div style="font-size:15px;line-height:1.65;color:var(--color-text-primary);">{clean}</div>'
    return f'<div style="border:0.5px solid rgba(128,128,128,0.25);border-radius:10px;padding:1rem 1.2rem;margin-bottom:10px;">{content}</div>'

def quote_box(original, korean=None):
    orig = str(original).replace("<","&lt;").replace(">","&gt;")
    html = '<div style="border-left:2px solid rgba(128,128,128,0.3);padding:10px 14px;margin:10px 0 16px;">'
    # [버그 수정] 하드코딩 "원문: ", "번역: " → ui_texts 키로 교체
    html += f'<div style="font-size:15px;line-height:1.65;color:var(--color-text-secondary);word-break:break-word;white-space:normal;">{ui.TEXTS["notion_quote_orig"].format(orig)}</div>'
    if korean:
        ko = str(korean).replace("<","&lt;").replace(">","&gt;")
        html += f'<div style="font-size:15px;line-height:1.65;color:var(--color-text-secondary);margin-top:7px;word-break:break-word;white-space:normal;">{ui.TEXTS["notion_quote_ko"].format(ko)}</div>'
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)

def playtime_header_card(title, total, avg, desc):
    color = desc_color(desc)
    return f'''
    <div style="background:rgba(128,128,128,0.07);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:0.75rem;">
        <div style="font-size:15px;font-weight:500;margin-bottom:10px;">{strip_md(title)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <span style="background:rgba(128,128,128,0.12);border-radius:999px;padding:4px 12px;font-size:13px;color:var(--color-text-secondary);">표본 {total:,}개</span>
            <span style="background:rgba(128,128,128,0.12);border-radius:999px;padding:4px 12px;font-size:13px;color:var(--color-text-secondary);">평균 {avg}h</span>
            <span style="background:rgba(128,128,128,0.12);border-radius:999px;padding:4px 12px;font-size:13px;font-weight:500;color:{color};">{desc}</span>
        </div>
    </div>'''


# ── 메인 렌더 ─────────────────────────────────────────────────────────────

def render_report_tabs():
    ins, stats = st.session_state.insights, st.session_state.stats

    with st.expander(ui.TEXTS['bot_info_title']):
        st.markdown(f'<p style="font-size:15px;line-height:1.8;color:var(--color-text-secondary);">{ui.TEXTS["bot_info_desc"]}</p>', unsafe_allow_html=True)

    # [버그 수정] 탭 레이블 하드코딩 → ui_texts 키로 교체
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        ui.TEXTS["tab_1"],
        ui.TEXTS["tab_2"],
        ui.TEXTS["tab_3"],
        ui.TEXTS["tab_4"],
        ui.TEXTS["tab_5"],
    ])

    # ════════════════════════════════════════════════════
    # Tab 1: 주요 요약
    # ════════════════════════════════════════════════════
    with tab1:
        c1, c2, c3 = st.columns(3)
        with c1:
            st.markdown(f'''
            <div style="background:rgba(128,128,128,0.07);border-radius:10px;padding:1.1rem 1.2rem;">
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:7px;">스팀 공식 평점</div>
                <div style="font-size:19px;font-weight:500;color:{eval_color(stats.get("official_desc",""))};">{stats.get("official_desc", ui.TEXTS["steam_eval_none"])}</div>
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-top:5px;">상점 직구매 유저 기준</div>
            </div>''', unsafe_allow_html=True)
            st.caption(f"ℹ️ {ui.TEXTS['tooltip_official']}")
        with c2:
            st.markdown(f'''
            <div style="background:rgba(128,128,128,0.07);border-radius:10px;padding:1.1rem 1.2rem;">
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:7px;">전체 누적 평점</div>
                <div style="font-size:19px;font-weight:500;color:{eval_color(stats["all_desc"])};">{stats["all_desc"]}</div>
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-top:5px;">총 {stats["all_total"]:,}개</div>
            </div>''', unsafe_allow_html=True)
            st.caption(f"ℹ️ {ui.TEXTS['tooltip_all']}")
        with c3:
            period = stats.get('collection_period','')
            st.markdown(f'''
            <div style="background:rgba(128,128,128,0.07);border-radius:10px;padding:1.1rem 1.2rem;">
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:7px;">{st.session_state.recent_label} 평점</div>
                <div style="font-size:19px;font-weight:500;color:{eval_color(stats["recent_desc"])};">{stats["recent_desc"]}</div>
                <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-top:5px;">표본 {stats["recent_total"]:,}개</div>
            </div>''', unsafe_allow_html=True)
            if period:
                st.caption(ui.TEXTS["period_collect"].format(period))
            # [버그 수정] period_toggle_label 키 사용 + <details> 방식으로 expander 크기 문제 우회
            st.markdown(f'''
            <details style="margin-top:4px;">
                <summary style="font-size:12px;color:rgba(128,128,128,0.6);cursor:pointer;list-style:none;user-select:none;">
                    ▸ {ui.TEXTS["period_toggle_why"]}
                </summary>
                <div style="font-size:13px;line-height:1.7;color:rgba(128,128,128,0.7);margin-top:6px;padding:8px 10px;background:rgba(128,128,128,0.05);border-radius:6px;">
                    {st.session_state.smart_reason}
                </div>
            </details>''', unsafe_allow_html=True)

        st.write("")
        gray_box(ui.TEXTS["summary_briefing"], ins.get('sentiment_analysis',''))

        sec("sec_trend")
        col_a, col_b = st.columns(2)
        with col_a:
            st.markdown('<p style="font-size:16px;font-weight:500;margin-bottom:10px;">누적 여론 동향</p>', unsafe_allow_html=True)
            for line in sort_sentiments(ins.get('final_summary_all',[])):
                st.markdown(s_html(line), unsafe_allow_html=True)
        with col_b:
            st.markdown(f'<p style="font-size:16px;font-weight:500;margin-bottom:6px;">{st.session_state.recent_label} 동향</p>', unsafe_allow_html=True)
            if period:
                st.markdown(f'<p style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:8px;">📅 {period}</p>', unsafe_allow_html=True)
            for line in sort_sentiments(ins.get('final_summary_recent',[])):
                st.markdown(s_html(line), unsafe_allow_html=True)

        st.divider()
        sec("sec_category")
        cats_all = sorted(ins.get('global_category_summary',[]), key=lambda x: get_cat_sort_key(x.get('category','')))
        cats_pos = [c for c in cats_all if "[긍정" in c.get('category','')]
        cats_neg = [c for c in cats_all if "[부정" in c.get('category','')]
        cats_etc = [c for c in cats_all if "[긍정" not in c.get('category','') and "[부정" not in c.get('category','')]

        col_pos, col_neg = st.columns(2)
        with col_pos:
            if cats_pos:
                st.markdown('<p style="font-size:15px;font-weight:500;color:#0C447C;margin-bottom:8px;">✅ 긍정 평가</p>', unsafe_allow_html=True)
                for cat in cats_pos:
                    name = cat.get('category','')
                    with st.expander(f"✅ {clean_cat(name)}"):
                        for line in sort_sentiments(cat.get('summary',[])):
                            st.markdown(s_html(line), unsafe_allow_html=True)
        with col_neg:
            if cats_neg:
                st.markdown('<p style="font-size:15px;font-weight:500;color:#791F1F;margin-bottom:8px;">⚠️ 부정 평가</p>', unsafe_allow_html=True)
                for cat in cats_neg:
                    name = cat.get('category','')
                    with st.expander(f"⚠️ {clean_cat(name)}"):
                        for line in sort_sentiments(cat.get('summary',[])):
                            st.markdown(s_html(line), unsafe_allow_html=True)
        # 중립 카테고리는 2열 아래에 전체 폭으로 표시
        for cat in cats_etc:
            name = cat.get('category','')
            with st.expander(f"📌 {clean_cat(name)}"):
                for line in sort_sentiments(cat.get('summary',[])):
                    st.markdown(s_html(line), unsafe_allow_html=True)

    # ════════════════════════════════════════════════════
    # Tab 2: 소식 & 이슈
    # ════════════════════════════════════════════════════
    with tab2:
        c_news, c_issue = st.columns(2)
        with c_news:
            sec("sec_news")
            news = st.session_state.news_data
            if news and news[0]:
                if len(news) > 4 and news[4]:
                    st.image(news[4], width=320)
                st.markdown(f'''
                <div style="border:0.5px solid rgba(128,128,128,0.25);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem;">
                    <div style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:7px;">{news[3]}</div>
                    <a href="{news[2]}" target="_blank" style="font-size:16px;font-weight:500;color:var(--color-text-primary);text-decoration:none;line-height:1.5;">{strip_md(news[0])}</a>
                </div>''', unsafe_allow_html=True)
                for line in ins.get('news_summary',[]):
                    st.markdown(f'<div style="font-size:16px;line-height:1.65;margin-bottom:8px;">• {strip_md(line)}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<p style="font-size:16px;color:rgba(128,128,128,0.7);">{ui.TEXTS["no_news"]}</p>', unsafe_allow_html=True)

        with c_issue:
            sec("sec_issue")
            period = stats.get('collection_period','')
            if period:
                st.markdown(f'<p style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:4px;">📅 추출 기간: {period}</p>', unsafe_allow_html=True)
            st.markdown(f'<p style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:12px;">{ui.TEXTS["issue_pick_desc"]}</p>', unsafe_allow_html=True)
            for line in ins.get('ai_issue_pick',[]):
                st.markdown(issue_card(line), unsafe_allow_html=True)
            if not ins.get('ai_issue_pick'):
                st.markdown(f'<p style="font-size:15px;color:rgba(128,128,128,0.7);">{ui.TEXTS["no_issue_pick"]}</p>', unsafe_allow_html=True)

    # ════════════════════════════════════════════════════
    # Tab 3: 플레이타임
    # ════════════════════════════════════════════════════
    with tab3:
        sec("sec_playtime")
        st.markdown(f'<p style="font-size:13px;color:rgba(128,128,128,0.7);margin-bottom:1rem;">{ui.TEXTS["tooltip_playtime"]}</p>', unsafe_allow_html=True)
        pt = ins.get('playtime_analysis',{})
        if pt:
            if pt.get('comparison_insights'):
                gray_box(ui.TEXTS["insight_core_title"], items=pt.get('comparison_insights',[]))
            p1, p2, p3 = st.columns(3)
            for col, tk, tot_k, avg_k, desc_k, sum_k, def_t in [
                (p1,'newbie_title','newbie_total','newbie_avg','newbie_desc','newbie_summary',ui.TEXTS['newbie_title_default']),
                (p2,'normal_title','norm_total',  'norm_avg',  'norm_desc',  'normal_summary',ui.TEXTS['normal_title_default']),
                (p3,'core_title',  'core_total',  'core_avg',  'core_desc',  'core_summary',  ui.TEXTS['core_title_default']),
            ]:
                with col:
                    st.markdown(playtime_header_card(
                        pt.get(tk, def_t),
                        stats.get(tot_k, 0),
                        stats.get(avg_k, 0),
                        stats.get(desc_k, ui.TEXTS["steam_eval_none"])
                    ), unsafe_allow_html=True)
                    for line in sort_sentiments(pt.get(sum_k,[])):
                        st.markdown(s_html(line), unsafe_allow_html=True)

    # ════════════════════════════════════════════════════
    # Tab 4: 글로벌 분석
    # ════════════════════════════════════════════════════
    with tab4:
        sec("sec_region")
        # [버그 수정] 권역 언어 안내 하드코딩 → ui_texts "region_lang_tooltip_html" 키로 교체
        st.markdown(f'''
        <details style="margin-bottom:1rem;">
            <summary style="font-size:13px;color:rgba(128,128,128,0.6);cursor:pointer;list-style:none;user-select:none;">
                ▸ 각 권역에 어떤 언어가 포함되나요?
            </summary>
            <div style="font-size:13px;line-height:1.9;color:rgba(128,128,128,0.75);margin-top:8px;padding:10px 14px;background:rgba(128,128,128,0.05);border-radius:8px;">
                {ui.TEXTS["region_lang_tooltip_html"]}
            </div>
        </details>''', unsafe_allow_html=True)

        reg_data = ins.get('region_analysis',{})
        if reg_data.get('divergence_insight'):
            gray_box(ui.TEXTS["divergence_insight_title"], reg_data['divergence_insight'])

        for reg in reg_data.get('regions',[]):
            with st.expander(f"📍 {strip_md(reg.get('region',''))}  —  {strip_md(reg.get('trend',''))}"):
                kws = reg.get('keywords',[])
                if kws:
                    st.markdown(f'<p style="font-size:14px;color:rgba(128,128,128,0.7);margin-bottom:10px;">🔑 {", ".join([strip_md(k) for k in kws])}</p>', unsafe_allow_html=True)
                for cat in sorted(reg.get('categories',[]), key=lambda x: get_cat_sort_key(x.get('name',''))):
                    n = cat.get('name','')
                    if n:
                        st.markdown(f'<div style="font-size:15px;font-weight:500;margin:10px 0 6px;">{cat_chip(n)}{clean_cat(n)}</div>', unsafe_allow_html=True)
                    for line in sort_sentiments(cat.get('summary',[])):
                        st.markdown(s_html(line), unsafe_allow_html=True)

        st.divider()
        sec("sec_country")
        st.markdown(f'<p style="font-size:14px;color:rgba(128,128,128,0.7);margin-bottom:1rem;">{ui.TEXTS["country_analysis_desc"]}</p>', unsafe_allow_html=True)

        # [1번 수정] country_analysis는 AI가 country_langs_ordered 순서대로 생성하도록 프롬프트에서 보장됨
        # 화면에는 순위 뱃지를 붙여서 TOP1~3 + 한국어 순서임을 명시
        country_langs_ordered = stats.get('country_langs_ordered', [])
        countries = ins.get('country_analysis', [])
        for idx, country in enumerate(countries):
            country_name = strip_md(country.get("country", ""))
            # 순위 뱃지 표시
            if idx < len(country_langs_ordered):
                rank_label = f"TOP {idx+1}" if idx < 3 else "🇰🇷 한국어"
                badge_bg = "#E6F1FB" if idx < 3 else "#F3F0FF"
                badge_color = "#0C447C" if idx < 3 else "#5B3FB5"
                rank_badge = f'<span style="background:{badge_bg};color:{badge_color};font-size:12px;font-weight:500;padding:3px 10px;border-radius:999px;margin-right:8px;">{rank_label}</span>'
            else:
                rank_badge = ''
            st.markdown(f'<p style="font-size:17px;font-weight:500;margin-top:1.5rem;margin-bottom:0.75rem;">🚩 {rank_badge}{country_name}</p>', unsafe_allow_html=True)
            for cat in sorted(country.get('categories',[]), key=lambda x: get_cat_sort_key(x.get('name',''))):
                n = cat.get('name','')
                if n:
                    st.markdown(f'<div style="font-size:16px;font-weight:500;margin:10px 0 6px;">{cat_chip(n)}{clean_cat(n)}</div>', unsafe_allow_html=True)
                for line in sort_sentiments(cat.get('summary',[])):
                    st.markdown(s_html(line), unsafe_allow_html=True)
                quote = cat.get('quote',{})
                if quote and quote.get('original'):
                    with st.expander("👀 유저 리뷰 원문 보기"):
                        orig = str(quote.get('original','')).replace('<','&lt;').replace('>','&gt;')
                        ko = quote.get('korean') or ''
                        # 원문에 🇰🇷 한국어 태그가 없으면 외국어 리뷰 → 번역 필요
                        is_korean_review = '한국어' in str(quote.get('original',''))
                        html = '<div style="border-left:2px solid rgba(128,128,128,0.3);padding:10px 14px;">'
                        html += f'<div style="font-size:14px;line-height:1.65;color:rgba(128,128,128,0.75);word-break:break-word;">{ui.TEXTS["notion_quote_orig"].format(orig)}</div>'
                        if ko:
                            ko_esc = str(ko).replace('<','&lt;').replace('>','&gt;')
                            html += f'<div style="font-size:14px;line-height:1.65;color:rgba(128,128,128,0.65);margin-top:6px;word-break:break-word;">{ui.TEXTS["notion_quote_ko"].format(ko_esc)}</div>'
                        elif not is_korean_review:
                            # 외국어인데 번역이 없는 경우 — AI가 번역을 누락한 케이스
                            html += '<div style="font-size:13px;color:rgba(128,128,128,0.45);margin-top:6px;font-style:italic;">번역: (AI가 번역을 생성하지 않았습니다)</div>'
                        html += '</div>'
                        st.markdown(html, unsafe_allow_html=True)

        st.divider()
        with st.expander(ui.TEXTS.get("sec_stats","🌐 글로벌 통계표") + " 펼치기"):
            st.caption(ui.TEXTS["disclaimer_language"])
            df_reg = pd.DataFrame([[r['rank'],r['region'],f"{r['count']:,}개",r['ratio'],r['pos_ratio'],r['neg_ratio'],r['eval']] for r in stats['table_data_region']], columns=[ui.TEXTS["col_rank"],ui.TEXTS["col_region"],ui.TEXTS["col_count"],ui.TEXTS["col_ratio"],ui.TEXTS["col_pos"],ui.TEXTS["col_neg"],ui.TEXTS["col_eval"]])
            df_all = pd.DataFrame([[r['rank'],r['lang'],f"{r['count']:,}개",r['ratio'],r['pos_ratio'],r['neg_ratio'],r['eval']] for r in stats['table_data_all']], columns=[ui.TEXTS["col_rank"],ui.TEXTS["col_lang"],ui.TEXTS["col_count"],ui.TEXTS["col_ratio"],ui.TEXTS["col_pos"],ui.TEXTS["col_neg"],ui.TEXTS["col_eval"]])
            df_30 = pd.DataFrame([[r['rank'],r['lang'],f"{r['count']:,}개",r['ratio'],r['pos_ratio'],r['neg_ratio'],r['eval']] for r in stats['table_data_30']], columns=[ui.TEXTS["col_rank"],ui.TEXTS["col_lang"],ui.TEXTS["col_count"],ui.TEXTS["col_ratio"],ui.TEXTS["col_pos"],ui.TEXTS["col_neg"],ui.TEXTS["col_eval"]])
            try:
                s_reg   = df_reg.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_all_t = df_all.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_all_f = df_all.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_30_t  = df_30.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_30_f  = df_30.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            except:
                s_reg   = df_reg.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_all_t = df_all.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_all_f = df_all.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_30_t  = df_30.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
                s_30_f  = df_30.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st.markdown("##### 권역별 누적 비중"); st.dataframe(s_reg, hide_index=True, use_container_width=True)
            st.markdown("##### 언어별 누적 비중 TOP 10"); st.dataframe(s_all_t, hide_index=True, use_container_width=True)
            with st.expander("전체 보기"): st.dataframe(s_all_f, hide_index=True, use_container_width=True)
            st.markdown("##### 최근 30일 언어별 비중 TOP 10")
            if stats['days_since_release'] < 30:
                st.info(ui.TEXTS["info_30_days"])
            else:
                period = stats.get('collection_period','')
                if period: st.caption(f"📅 {period}  ({st.session_state.smart_reason})")
                st.dataframe(s_30_t, hide_index=True, use_container_width=True)
                with st.expander("전체 보기"): st.dataframe(s_30_f, hide_index=True, use_container_width=True)

    # ════════════════════════════════════════════════════
    # Tab 5: AI 질문
    # ════════════════════════════════════════════════════
    with tab5:
        sec("sec_qa")
        st.markdown(f'<p style="font-size:15px;color:rgba(128,128,128,0.8);margin-bottom:1.5rem;">{ui.TEXTS["qa_desc"]}</p>', unsafe_allow_html=True)

        if st.session_state.get('qa_history'):
            for qa in st.session_state.qa_history:
                st.markdown(f'<p style="font-size:16px;font-weight:500;margin-bottom:5px;">Q. {strip_md(qa["q"])}</p>', unsafe_allow_html=True)
                st.info(f"A. {strip_md(qa['a'])}")
            st.divider()

        q_input = st.text_input("QA Input", placeholder=ui.TEXTS["qa_input_ph"], label_visibility="collapsed")
        if st.button(ui.TEXTS["qa_btn"], type="primary", key="btn_qa_ask"):
            if q_input:
                with st.spinner(ui.TEXTS["qa_loading"]):
                    ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                    if not err:
                        st.session_state.current_q = q_input
                        st.session_state.current_a = ans
                        st.rerun()

        if st.session_state.get('current_a'):
            st.markdown("---")
            st.markdown(f'<p style="font-size:16px;font-weight:500;margin-bottom:5px;">Q. {strip_md(st.session_state.current_q)}</p>', unsafe_allow_html=True)
            st.success(f"A. {strip_md(st.session_state.current_a)}")
            if st.button(ui.TEXTS["qa_add_btn"], key="btn_qa_add"):
                st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                for h in st.session_state.history:
                    if h['app_id'] == st.session_state.app_id:
                        h['qa_history'] = st.session_state.qa_history
                st.session_state.current_q = ""
                st.session_state.current_a = ""
                st.rerun()
