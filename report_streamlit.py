import streamlit as st
import pandas as pd
import ui_texts as ui
from ai_analyzer import ask_followup_question

def get_cat_sort_key(cat_name):
    if "[긍정" in cat_name: return 0
    elif "[부정" in cat_name: return 1
    return 2

def sort_sentiments(lines):
    if not isinstance(lines, list): return []
    return sorted(lines, key=lambda l: 0 if "[긍정]" in l else (1 if "[부정]" in l else 2))

def apply_eval_color(val):
    v = str(val)
    return "color: #185FA5" if "긍정" in v else ("color: #A32D2D" if "부정" in v else "color: #888888")

# 긍/부정 뱃지 + 본문 텍스트 렌더 (st.markdown용)
def render_sentiment_line(line):
    if "[긍정]" in line:
        body = line.replace("[긍정]", "").strip()
        return f'<span style="display:inline-block;background:#E6F1FB;color:#185FA5;font-size:11px;font-weight:500;padding:2px 8px;border-radius:999px;margin-right:6px;">긍정</span>{body}'
    elif "[부정]" in line:
        body = line.replace("[부정]", "").strip()
        return f'<span style="display:inline-block;background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:500;padding:2px 8px;border-radius:999px;margin-right:6px;">부정</span>{body}'
    return line

# 섹션 레이블 렌더
def section_label(text):
    st.markdown(f'<p style="font-size:11px;font-weight:500;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin-top:1.5rem;margin-bottom:0.6rem;">{text}</p>', unsafe_allow_html=True)

# 회색 배경 브리핑 박스
def render_briefing_box(title, content):
    st.markdown(f'''
    <div style="background:var(--color-background-secondary);border-radius:10px;padding:1.1rem 1.25rem;margin-bottom:1rem;">
        <div style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:6px;">{title}</div>
        <div style="font-size:14px;line-height:1.7;color:var(--color-text-secondary);">{content.replace(chr(10), "<br>")}</div>
    </div>''', unsafe_allow_html=True)

# 회색 배경 리스트 박스
def render_list_box(title, items):
    li_html = "".join([f'<li style="margin-bottom:5px;">{item}</li>' for item in items])
    st.markdown(f'''
    <div style="background:var(--color-background-secondary);border-radius:10px;padding:1.1rem 1.25rem;margin-bottom:1rem;">
        <div style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:8px;">{title}</div>
        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:var(--color-text-secondary);">{li_html}</ul>
    </div>''', unsafe_allow_html=True)

# 메트릭 카드 색상 결정
def eval_color(val):
    if "긍정" in str(val): return "#185FA5"
    if "부정" in str(val): return "#A32D2D"
    return "var(--color-text-secondary)"

def render_report_tabs():
    ins, stats = st.session_state.insights, st.session_state.stats

    with st.expander(ui.TEXTS['bot_info_title']):
        st.markdown(ui.TEXTS['bot_info_desc'])

    tab1, tab2, tab3, tab4, tab5 = st.tabs([ui.TEXTS["tab_summary"], ui.TEXTS["tab_news_issue"], ui.TEXTS["tab_playtime"], ui.TEXTS["tab_region"], ui.TEXTS["tab_qa"]])

    # ── Tab 1: 주요 평가 요약 ──────────────────────────────────────────────
    with tab1:
        # 한줄평 카드
        st.markdown(f'''
        <div style="border:0.5px solid var(--color-border-tertiary);border-radius:14px;padding:1.75rem 1.5rem;text-align:center;margin-bottom:1.5rem;">
            <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:10px;letter-spacing:0.03em;">{ui.TEXTS["ai_one_liner_desc"].format(st.session_state.rel_date_str, st.session_state.game_name)}</div>
            <div style="font-size:19px;font-weight:500;line-height:1.6;margin-bottom:14px;">❝ {ins.get("critic_one_liner", "")} ❞</div>
        </div>''', unsafe_allow_html=True)

        # 민심 지표 3열
        st.markdown(f'''
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:1rem;">
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:5px;">{ui.TEXTS["metric_official"]}</div>
                <div style="font-size:17px;font-weight:500;color:{eval_color(stats.get("official_desc",""))};">{stats.get("official_desc", ui.TEXTS["steam_eval_none"])}</div>
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px;">상점 직구매 유저 기준</div>
            </div>
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:5px;">{ui.TEXTS["metric_all"]}</div>
                <div style="font-size:17px;font-weight:500;color:{eval_color(stats["all_desc"])};">{stats["all_desc"]}</div>
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px;">총 {stats["all_total"]:,}개</div>
            </div>
            <div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;">
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:5px;">{ui.TEXTS["metric_recent"].format(st.session_state.recent_label)}</div>
                <div style="font-size:17px;font-weight:500;color:{eval_color(stats["recent_desc"])};">{stats["recent_desc"]}</div>
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px;">표본 {stats["recent_total"]:,}개</div>
            </div>
        </div>''', unsafe_allow_html=True)

        render_briefing_box(ui.TEXTS["summary_briefing"], ins.get('sentiment_analysis', ''))

        # 여론 동향 2열
        section_label("여론 동향")
        c1, c2 = st.columns(2)
        with c1:
            st.markdown(f'<p style="font-size:13px;font-weight:500;margin-bottom:8px;">{ui.TEXTS["trend_all"]}</p>', unsafe_allow_html=True)
            for line in sort_sentiments(ins.get('final_summary_all', [])):
                st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:6px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)
        with c2:
            st.markdown(f'<p style="font-size:13px;font-weight:500;margin-bottom:4px;">{ui.TEXTS["trend_recent"].format(st.session_state.recent_label)}</p>', unsafe_allow_html=True)
            st.caption(ui.TEXTS["date_period_info"].format(stats.get('collection_period', ''), st.session_state.smart_reason))
            for line in sort_sentiments(ins.get('final_summary_recent', [])):
                st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:6px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)

        st.divider()
        section_label("카테고리별 상세 평가")
        categories = sorted(ins.get('global_category_summary', []), key=lambda x: get_cat_sort_key(x.get('category', '')))
        for cat in categories:
            cat_name = cat.get('category', '')
            chip_color = "#E6F1FB" if "[긍정" in cat_name else ("#FCEBEB" if "[부정" in cat_name else "var(--color-background-secondary)")
            chip_text_color = "#185FA5" if "[긍정" in cat_name else ("#A32D2D" if "[부정" in cat_name else "var(--color-text-secondary)")
            label = "긍정" if "[긍정" in cat_name else ("부정" if "[부정" in cat_name else "")
            clean_name = cat_name.replace("[긍정]", "").replace("[부정]", "").strip()
            header_html = f'<span style="background:{chip_color};color:{chip_text_color};font-size:11px;font-weight:500;padding:2px 8px;border-radius:999px;margin-right:8px;">{label}</span>{clean_name}' if label else clean_name
            with st.expander(f"{'✅' if label == '긍정' else ('⚠️' if label == '부정' else '📌')} {clean_name}"):
                for line in sort_sentiments(cat.get('summary', [])):
                    st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:6px;padding-left:4px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)

    # ── Tab 2: 최신 소식 & 이슈 픽 ─────────────────────────────────────────
    with tab2:
        section_label("최신 소식")
        news = st.session_state.news_data
        if news and news[0]:
            if len(news) > 4 and news[4]:
                st.image(news[4], width=400)
            st.markdown(f'''
            <div style="border:0.5px solid var(--color-border-tertiary);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem;">
                <div style="font-size:11px;color:var(--color-text-tertiary);margin-bottom:6px;">{news[3]}</div>
                <a href="{news[2]}" target="_blank" style="font-size:14px;font-weight:500;color:var(--color-text-primary);text-decoration:none;">{news[0]}</a>
            </div>''', unsafe_allow_html=True)
            for line in ins.get('news_summary', []):
                st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:5px;padding-left:4px;">• {line}</div>', unsafe_allow_html=True)
        else:
            st.write(ui.TEXTS["no_news"])

        st.divider()
        section_label("주요 이슈 픽")
        st.caption(ui.TEXTS["issue_pick_desc"].format(st.session_state.smart_reason))
        issues = ins.get('ai_issue_pick', [])
        if issues:
            for line in issues:
                st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:8px;padding-left:4px;">📍 {line}</div>', unsafe_allow_html=True)
        else:
            st.info(ui.TEXTS["no_issue_pick"])

    # ── Tab 3: 플레이타임 ──────────────────────────────────────────────────
    with tab3:
        section_label("플레이타임별 민심 교차 분석")
        st.caption(ui.TEXTS['tooltip_playtime'])
        pt = ins.get('playtime_analysis', {})
        if pt:
            if pt.get('comparison_insights'):
                render_list_box(ui.TEXTS["insight_core_title"], pt.get('comparison_insights', []))

            p1, p2, p3 = st.columns(3)
            for col, title_key, total_key, avg_key, desc_key, summary_key, default_title in [
                (p1, 'newbie_title', 'newbie_total', 'newbie_avg', 'newbie_desc', 'newbie_summary', ui.TEXTS['newbie_title_default']),
                (p2, 'normal_title', 'norm_total',  'norm_avg',   'norm_desc',   'normal_summary', ui.TEXTS['normal_title_default']),
                (p3, 'core_title',   'core_total',  'core_avg',   'core_desc',   'core_summary',   ui.TEXTS['core_title_default']),
            ]:
                with col:
                    st.markdown(f'<div style="background:var(--color-background-secondary);border-radius:10px;padding:1rem 1.1rem;margin-bottom:0.5rem;"><div style="font-size:13px;font-weight:500;margin-bottom:3px;">{pt.get(title_key, default_title)}</div><div style="font-size:11px;color:var(--color-text-tertiary);">{ui.TEXTS["sample_opinion"].format(stats.get(total_key,0), stats.get(avg_key,0), stats.get(desc_key, ui.TEXTS["steam_eval_none"]))}</div></div>', unsafe_allow_html=True)
                    for line in sort_sentiments(pt.get(summary_key, [])):
                        st.markdown(f'<div style="font-size:13px;line-height:1.6;margin-bottom:5px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)

    # ── Tab 4: 리뷰 작성 언어별 평가 ──────────────────────────────────────
    with tab4:
        section_label("권역별 세부 평가")
        reg_data = ins.get('region_analysis', {})
        if reg_data.get('divergence_insight'):
            render_briefing_box(ui.TEXTS["divergence_insight_title"], reg_data['divergence_insight'])

        for reg in reg_data.get('regions', []):
            with st.expander(ui.TEXTS["region_expander"].format(reg.get('region'), reg.get('trend'))):
                st.caption(ui.TEXTS["keyword_label"].format(', '.join(reg.get('keywords', []))))
                for cat in sorted(reg.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
                    cat_name = cat.get('name', '')
                    if cat_name:
                        clean_name = cat_name.replace("[긍정]", "").replace("[부정]", "").strip()
                        chip = '<span style="background:#E6F1FB;color:#185FA5;font-size:11px;font-weight:500;padding:2px 7px;border-radius:999px;margin-right:6px;">긍정</span>' if "[긍정" in cat_name else ('<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:500;padding:2px 7px;border-radius:999px;margin-right:6px;">부정</span>' if "[부정" in cat_name else '')
                        st.markdown(f'<div style="font-size:14px;font-weight:500;margin:8px 0 4px;">{chip}{clean_name}</div>', unsafe_allow_html=True)
                    for line in sort_sentiments(cat.get('summary', [])):
                        st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:5px;padding-left:4px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)

        st.divider()
        section_label("국가별 원문 분석")
        st.caption(ui.TEXTS["country_analysis_desc"])

        for country in ins.get('country_analysis', []):
            st.markdown(f'<p style="font-size:15px;font-weight:500;margin-top:1.25rem;margin-bottom:0.5rem;">🚩 {country.get("country", "")}</p>', unsafe_allow_html=True)
            for cat in sorted(country.get('categories', []), key=lambda x: get_cat_sort_key(x.get('name', ''))):
                cat_name = cat.get('name', '')
                if cat_name:
                    clean_name = cat_name.replace("[긍정]", "").replace("[부정]", "").strip()
                    chip = '<span style="background:#E6F1FB;color:#185FA5;font-size:11px;font-weight:500;padding:2px 7px;border-radius:999px;margin-right:6px;">긍정</span>' if "[긍정" in cat_name else ('<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:500;padding:2px 7px;border-radius:999px;margin-right:6px;">부정</span>' if "[부정" in cat_name else '')
                    st.markdown(f'<div style="font-size:14px;font-weight:500;margin:8px 0 4px;">{chip}{clean_name}</div>', unsafe_allow_html=True)
                for line in sort_sentiments(cat.get('summary', [])):
                    st.markdown(f'<div style="font-size:14px;line-height:1.6;margin-bottom:5px;padding-left:4px;">{render_sentiment_line(line)}</div>', unsafe_allow_html=True)
                quote = cat.get('quote', {})
                if quote and quote.get('original'):
                    st.markdown(f'<div style="border-left:2px solid var(--color-border-secondary);padding:8px 12px;margin-top:6px;font-size:13px;color:var(--color-text-secondary);line-height:1.6;">원문: {quote.get("original")}</div>', unsafe_allow_html=True)
                    if quote.get('korean'):
                        st.markdown(f'<div style="border-left:2px solid var(--color-border-secondary);padding:8px 12px;margin-top:4px;font-size:13px;color:var(--color-text-secondary);line-height:1.6;">번역: {quote.get("korean")}</div>', unsafe_allow_html=True)

        st.divider()
        section_label("글로벌 언어 및 권역 통계")
        st.caption(ui.TEXTS["disclaimer_language"])

        df_reg = pd.DataFrame([[r['rank'], r['region'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_region']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_region"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])
        df_all = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_all']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])
        df_30 = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_30']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])

        try:
            st_reg   = df_reg.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_t = df_all.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_f = df_all.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_t  = df_30.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_f  = df_30.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
        except:
            st_reg   = df_reg.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_t = df_all.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_f = df_all.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_t  = df_30.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_f  = df_30.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])

        st.markdown(ui.TEXTS["table_region_title"]); st.dataframe(st_reg, hide_index=True, use_container_width=True)
        st.markdown(ui.TEXTS["table_all_title"]); st.dataframe(st_all_t, hide_index=True, use_container_width=True)
        with st.expander(ui.TEXTS["toggle_all_table"]): st.dataframe(st_all_f, hide_index=True, use_container_width=True)

        st.markdown(ui.TEXTS["table_30_title"])
        if stats['days_since_release'] < 30:
            st.info(ui.TEXTS["info_30_days"])
        else:
            st.caption(ui.TEXTS["date_period_info"].format(stats.get('collection_period', ''), st.session_state.smart_reason))
            st.dataframe(st_30_t, hide_index=True, use_container_width=True)
            with st.expander(ui.TEXTS["toggle_30_table"]): st.dataframe(st_30_f, hide_index=True, use_container_width=True)

    # ── Tab 5: AI 질문 ─────────────────────────────────────────────────────
    with tab5:
        st.markdown(f'<p style="font-size:16px;font-weight:500;margin-bottom:4px;">{ui.TEXTS["qa_title"]}</p>', unsafe_allow_html=True)
        st.caption(ui.TEXTS['qa_desc'])

        if st.session_state.qa_history:
            st.divider()
            for qa in st.session_state.qa_history:
                st.markdown(f'<p style="font-size:14px;font-weight:500;margin-bottom:4px;">Q. {qa["q"]}</p>', unsafe_allow_html=True)
                st.info(f"A. {qa['a']}")
            st.divider()

        q_input = st.text_input("QA Input", placeholder=ui.TEXTS["qa_input_ph"], label_visibility="collapsed")
        if st.button(ui.TEXTS["qa_btn"], type="primary"):
            if q_input:
                with st.spinner(ui.TEXTS["qa_loading"]):
                    ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                    if not err: st.session_state.current_q, st.session_state.current_a = q_input, ans; st.rerun()

        if st.session_state.get('current_a'):
            st.markdown("---")
            st.markdown(f'<p style="font-size:14px;font-weight:500;margin-bottom:4px;">Q. {st.session_state.current_q}</p>', unsafe_allow_html=True)
            st.success(f"A. {st.session_state.current_a}")
            if st.button(ui.TEXTS["qa_add_btn"]):
                st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                for h in st.session_state.history:
                    if h['app_id'] == st.session_state.app_id: h['qa_history'] = st.session_state.qa_history
                st.session_state.current_q, st.session_state.current_a = "", ""; st.rerun()
