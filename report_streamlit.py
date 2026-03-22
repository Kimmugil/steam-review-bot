import streamlit as st
import pandas as pd
import ui_texts as ui
from ai_analyzer import ask_followup_question

# ── 유틸 함수 ────────────────────────────────────────────────────────────

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
    return "var(--color-text-secondary)"

def clean_cat(name):
    return name.replace("[긍정]", "").replace("[부정]", "").strip()

def cat_chip(name):
    if "[긍정" in name:
        return '<span style="background:#E6F1FB;color:#0C447C;font-size:12px;font-weight:500;padding:3px 9px;border-radius:999px;margin-right:8px;">긍정</span>'
    if "[부정" in name:
        return '<span style="background:#FCEBEB;color:#791F1F;font-size:12px;font-weight:500;padding:3px 9px;border-radius:999px;margin-right:8px;">부정</span>'
    return ''

# 긍/부정 뱃지 + 본문 HTML
def sentiment_html(line, font_size="15px"):
    if "[긍정]" in line:
        body = line.replace("[긍정]", "").strip()
        return f'<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;"><span style="background:#E6F1FB;color:#0C447C;font-size:12px;font-weight:500;padding:3px 9px;border-radius:999px;white-space:nowrap;flex-shrink:0;">긍정</span><span style="font-size:{font_size};line-height:1.65;color:var(--color-text-primary);">{body}</span></div>'
    if "[부정]" in line:
        body = line.replace("[부정]", "").strip()
        return f'<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;"><span style="background:#FCEBEB;color:#791F1F;font-size:12px;font-weight:500;padding:3px 9px;border-radius:999px;white-space:nowrap;flex-shrink:0;">부정</span><span style="font-size:{font_size};line-height:1.65;color:var(--color-text-primary);">{body}</span></div>'
    return f'<div style="font-size:{font_size};line-height:1.65;margin-bottom:8px;color:var(--color-text-primary);">{line}</div>'

# 섹션 레이블
def sec(text):
    st.markdown(f'<p style="font-size:12px;font-weight:500;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin:2rem 0 0.75rem;">{text}</p>', unsafe_allow_html=True)

# 회색 배경 박스
def gray_box(title, body_text=None, items=None):
    html = '<div style="background:var(--color-background-secondary);border-radius:10px;padding:1.1rem 1.25rem;margin-bottom:1rem;">'
    if title:
        html += f'<div style="font-size:13px;font-weight:500;color:var(--color-text-primary);margin-bottom:8px;">{title}</div>'
    if body_text:
        html += f'<div style="font-size:15px;line-height:1.7;color:var(--color-text-secondary);">{body_text.replace(chr(10), "<br>")}</div>'
    if items:
        html += '<ul style="margin:0;padding-left:20px;">'
        for item in items:
            html += f'<li style="font-size:15px;line-height:1.65;margin-bottom:6px;color:var(--color-text-secondary);">{item}</li>'
        html += '</ul>'
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)

# 리뷰 원문 인용 박스 — 줄바꿈 없이, 회색 텍스트
def quote_box(original, korean=None):
    orig_safe = str(original).replace("<", "&lt;").replace(">", "&gt;")
    html = '<div style="border-left:2px solid var(--color-border-secondary);padding:10px 14px;margin:8px 0 14px;border-radius:0;">'
    html += f'<div style="font-size:14px;line-height:1.65;color:var(--color-text-secondary);word-break:break-word;white-space:normal;">원문: {orig_safe}</div>'
    if korean:
        ko_safe = str(korean).replace("<", "&lt;").replace(">", "&gt;")
        html += f'<div style="font-size:14px;line-height:1.65;color:var(--color-text-secondary);margin-top:6px;word-break:break-word;white-space:normal;">번역: {ko_safe}</div>'
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)


# ── 메인 렌더 ────────────────────────────────────────────────────────────

def render_report_tabs():
    ins, stats = st.session_state.insights, st.session_state.stats

    with st.expander(ui.TEXTS['bot_info_title']):
        st.markdown(ui.TEXTS['bot_info_desc'])

    tab_report, tab_qa = st.tabs(["📊 분석 리포트", "🙋 AI에게 질문하기"])

    # ════════════════════════════════════════════════════════════════════
    # Tab 1 : 분석 리포트 (단일 스크롤)
    # ════════════════════════════════════════════════════════════════════
    with tab_report:

        # ── 한줄평 ──────────────────────────────────────────────────────
        st.markdown(f'''
        <div style="border:0.5px solid var(--color-border-tertiary);border-radius:14px;padding:2rem 1.75rem;text-align:center;margin-bottom:1.5rem;">
            <div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:10px;letter-spacing:0.03em;">{st.session_state.rel_date_str} 출시 · {st.session_state.game_name}</div>
            <div style="font-size:20px;font-weight:500;line-height:1.6;color:var(--color-text-primary);">❝ {ins.get("critic_one_liner", "")} ❞</div>
        </div>''', unsafe_allow_html=True)

        # ── 민심 3지표 ───────────────────────────────────────────────────
        st.markdown(f'''
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:1rem;">
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:6px;">스팀 공식 평점</div>
                <div style="font-size:18px;font-weight:500;color:{eval_color(stats.get('official_desc',''))};">{stats.get('official_desc', ui.TEXTS['steam_eval_none'])}</div>
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px;">상점 직구매 유저 기준</div>
            </div>
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:6px;">전체 누적 평점</div>
                <div style="font-size:18px;font-weight:500;color:{eval_color(stats['all_desc'])};">{stats['all_desc']}</div>
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px;">총 {stats['all_total']:,}개</div>
            </div>
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:6px;">{st.session_state.recent_label} 평점</div>
                <div style="font-size:18px;font-weight:500;color:{eval_color(stats['recent_desc'])};">{stats['recent_desc']}</div>
                <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px;">표본 {stats['recent_total']:,}개</div>
            </div>
        </div>''', unsafe_allow_html=True)

        # ── 종합 브리핑 ──────────────────────────────────────────────────
        gray_box("🎯 종합 여론 브리핑", ins.get('sentiment_analysis', ''))

        st.divider()

        # ── 최신 소식 + 이슈픽 2열 ──────────────────────────────────────
        sec("최신 소식 및 주요 이슈")
        col_news, col_issue = st.columns(2)

        with col_news:
            news = st.session_state.news_data
            if news and news[0]:
                if len(news) > 4 and news[4]:
                    st.image(news[4], width=300)
                st.markdown(f'''
                <div style="border:0.5px solid var(--color-border-tertiary);border-radius:10px;padding:1rem 1.1rem;margin-bottom:0.75rem;">
                    <div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:6px;">{news[3]}</div>
                    <a href="{news[2]}" target="_blank" style="font-size:15px;font-weight:500;color:var(--color-text-primary);text-decoration:none;line-height:1.5;">{news[0]}</a>
                </div>''', unsafe_allow_html=True)
                for line in ins.get('news_summary', []):
                    st.markdown(f'<div style="font-size:15px;line-height:1.65;margin-bottom:6px;color:var(--color-text-primary);">• {line}</div>', unsafe_allow_html=True)
            else:
                st.caption(ui.TEXTS["no_news"])

        with col_issue:
            st.markdown(f'<p style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:10px;">{ui.TEXTS["issue_pick_desc"]}</p>', unsafe_allow_html=True)
            for line in ins.get('ai_issue_pick', []):
                st.markdown(f'<div style="font-size:15px;line-height:1.65;margin-bottom:10px;color:var(--color-text-primary);">📍 {line}</div>', unsafe_allow_html=True)
            if not ins.get('ai_issue_pick'):
                st.caption(ui.TEXTS["no_issue_pick"])

        st.divider()

        # ── 플레이타임 교차 분석 ─────────────────────────────────────────
        sec("플레이타임별 민심 교차 분석")
        pt = ins.get('playtime_analysis', {})
        if pt:
            if pt.get('comparison_insights'):
                gray_box("⚖️ 핵심 교차 인사이트", items=pt.get('comparison_insights', []))

            p1, p2, p3 = st.columns(3)
            for col, tk, tot_k, avg_k, desc_k, sum_k, def_t in [
                (p1, 'newbie_title', 'newbie_total', 'newbie_avg', 'newbie_desc', 'newbie_summary', ui.TEXTS['newbie_title_default']),
                (p2, 'normal_title', 'norm_total',   'norm_avg',   'norm_desc',   'normal_summary', ui.TEXTS['normal_title_default']),
                (p3, 'core_title',   'core_total',   'core_avg',   'core_desc',   'core_summary',   ui.TEXTS['core_title_default']),
            ]:
                with col:
                    st.markdown(f'''
                    <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;margin-bottom:0.75rem;">
                        <div style="font-size:14px;font-weight:500;color:var(--color-text-primary);margin-bottom:4px;">{pt.get(tk, def_t)}</div>
                        <div style="font-size:12px;color:var(--color-text-tertiary);">표본 {stats.get(tot_k,0):,}개 · 평균 {stats.get(avg_k,0)}h · {stats.get(desc_k, ui.TEXTS["steam_eval_none"])}</div>
                    </div>''', unsafe_allow_html=True)
                    for line in sort_sentiments(pt.get(sum_k, [])):
                        st.markdown(sentiment_html(line), unsafe_allow_html=True)

        st.divider()

        # ── 전체 여론 동향 2열 ───────────────────────────────────────────
        sec("전체 여론 동향")
        t1, t2 = st.columns(2)
        with t1:
            st.markdown('<p style="font-size:14px;font-weight:500;margin-bottom:10px;">📈 누적 여론 동향</p>', unsafe_allow_html=True)
            for line in sort_sentiments(ins.get('final_summary_all', [])):
                st.markdown(sentiment_html(line), unsafe_allow_html=True)
        with t2:
            st.markdown(f'<p style="font-size:14px;font-weight:500;margin-bottom:6px;">🔥 {st.session_state.recent_label} 동향</p>', unsafe_allow_html=True)
            period = stats.get('collection_period', '')
            if period:
                st.markdown(f'<p style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:8px;">📅 {period}</p>', unsafe_allow_html=True)
            for line in sort_sentiments(ins.get('final_summary_recent', [])):
                st.markdown(sentiment_html(line), unsafe_allow_html=True)

        st.divider()

        # ── 카테고리별 상세 평가 ─────────────────────────────────────────
        sec("카테고리별 상세 평가")
        for cat in sorted(ins.get('global_category_summary', []), key=lambda x: get_cat_sort_key(x.get('category', ''))):
            name = cat.get('category', '')
            clean = clean_cat(name)
            icon = "✅" if "[긍정" in name else ("⚠️" if "[부정" in name else "📌")
            with st.expander(f"{icon} {clean}"):
                for line in sort_sentiments(cat.get('summary', [])):
                    st.markdown(sentiment_html(line), unsafe_allow_html=True)

        st.divider()

        # ── 권역별 세부 평가 ─────────────────────────────────────────────
        sec("권역별 세부 평가")
        reg_data = ins.get('region_analysis', {})
        if reg_data.get('divergence_insight'):
            gray_box("💡 권역별 주요 체크포인트", reg_data['divergence_insight'])

        for reg in reg_data.get('regions', []):
            with st.expander(f"📍 {reg.get('region', '')}  —  {reg.get('trend', '')}"):
                kws = reg.get('keywords', [])
                if kws:
                    st.markdown(f'<p style="font-size:13px;color:var(--color-text-tertiary);margin-bottom:10px;">🔑 {", ".join(kws)}</p>', unsafe_allow_html=True)
                for cat in sorted(reg.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
                    n = cat.get('name', '')
                    if n:
                        st.markdown(f'<div style="font-size:14px;font-weight:500;margin:10px 0 6px;">{cat_chip(n)}{clean_cat(n)}</div>', unsafe_allow_html=True)
                    for line in sort_sentiments(cat.get('summary', [])):
                        st.markdown(sentiment_html(line), unsafe_allow_html=True)

        st.divider()

        # ── 국가별 원문 분석 ─────────────────────────────────────────────
        sec("리뷰 작성 언어(국가)별 분석")
        st.markdown(f'<p style="font-size:13px;color:var(--color-text-tertiary);margin-bottom:1rem;">{ui.TEXTS["country_analysis_desc"]}</p>', unsafe_allow_html=True)

        for country in ins.get('country_analysis', []):
            st.markdown(f'<p style="font-size:16px;font-weight:500;margin-top:1.5rem;margin-bottom:0.75rem;">🚩 {country.get("country", "")}</p>', unsafe_allow_html=True)
            for cat in sorted(country.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
                n = cat.get('name', '')
                if n:
                    st.markdown(f'<div style="font-size:15px;font-weight:500;margin:10px 0 6px;">{cat_chip(n)}{clean_cat(n)}</div>', unsafe_allow_html=True)
                for line in sort_sentiments(cat.get('summary', [])):
                    st.markdown(sentiment_html(line), unsafe_allow_html=True)
                quote = cat.get('quote', {})
                if quote and quote.get('original'):
                    quote_box(quote.get('original'), quote.get('korean') or None)

        st.divider()

        # ── 글로벌 통계표 (접힘) ────────────────────────────────────────
        with st.expander("🌐 글로벌 언어 및 권역 통계표 펼치기"):
            st.caption(ui.TEXTS["disclaimer_language"])
            df_reg = pd.DataFrame(
                [[r['rank'], r['region'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_region']],
                columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_region"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]]
            )
            df_all = pd.DataFrame(
                [[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_all']],
                columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]]
            )
            df_30 = pd.DataFrame(
                [[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_30']],
                columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]]
            )
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

            st.markdown("##### 권역별 누적 비중")
            st.dataframe(s_reg, hide_index=True, use_container_width=True)
            st.markdown("##### 언어별 누적 비중 TOP 10")
            st.dataframe(s_all_t, hide_index=True, use_container_width=True)
            with st.expander("전체 보기"):
                st.dataframe(s_all_f, hide_index=True, use_container_width=True)
            st.markdown("##### 최근 30일 언어별 비중 TOP 10")
            if stats['days_since_release'] < 30:
                st.info(ui.TEXTS["info_30_days"])
            else:
                st.caption(ui.TEXTS["date_period_info"].format(stats.get('collection_period', ''), st.session_state.smart_reason))
                st.dataframe(s_30_t, hide_index=True, use_container_width=True)
                with st.expander("전체 보기"):
                    st.dataframe(s_30_f, hide_index=True, use_container_width=True)

    # ════════════════════════════════════════════════════════════════════
    # Tab 2 : AI 질문하기
    # ════════════════════════════════════════════════════════════════════
    with tab_qa:
        st.markdown('<p style="font-size:17px;font-weight:500;margin-bottom:4px;">AI에게 추가 질문하기</p>', unsafe_allow_html=True)
        st.caption(ui.TEXTS['qa_desc'])

        if st.session_state.get('qa_history'):
            st.divider()
            for qa in st.session_state.qa_history:
                st.markdown(f'<p style="font-size:15px;font-weight:500;margin-bottom:4px;">Q. {qa["q"]}</p>', unsafe_allow_html=True)
                st.info(f"A. {qa['a']}")
            st.divider()

        q_input = st.text_input("QA Input", placeholder=ui.TEXTS["qa_input_ph"], label_visibility="collapsed")
        if st.button(ui.TEXTS["qa_btn"], type="primary"):
            if q_input:
                with st.spinner(ui.TEXTS["qa_loading"]):
                    ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                    if not err:
                        st.session_state.current_q = q_input
                        st.session_state.current_a = ans
                        st.rerun()

        if st.session_state.get('current_a'):
            st.markdown("---")
            st.markdown(f'<p style="font-size:15px;font-weight:500;margin-bottom:4px;">Q. {st.session_state.current_q}</p>', unsafe_allow_html=True)
            st.success(f"A. {st.session_state.current_a}")
            if st.button(ui.TEXTS["qa_add_btn"]):
                st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                for h in st.session_state.history:
                    if h['app_id'] == st.session_state.app_id:
                        h['qa_history'] = st.session_state.qa_history
                st.session_state.current_q = ""
                st.session_state.current_a = ""
                st.rerun()
