import streamlit as st
import pandas as pd
import ui_texts as ui

def sort_sentiments(lines):
    if not isinstance(lines, list): return []
    def get_sort_key(line):
        if "[긍정]" in line: return 0
        elif "[부정]" in line: return 1
        return 2
    return sorted(lines, key=get_sort_key)

def render_colored_text(text):
    if "[긍정]" in text: return f":blue[{text}]"
    elif "[부정]" in text: return f":red[{text}]"
    return text

def apply_eval_color(val):
    v = str(val)
    return "color: #3182F6" if "긍정" in v else ("color: #F04452" if "부정" in v else "color: #888888")

def render_report_tabs():
    ins, stats = st.session_state.insights, st.session_state.stats
    
    st.info(f"**{ui.TEXTS['bot_info_title']}**\n\n{ui.TEXTS['bot_info_desc']}")
    
    tab1, tab2, tab3, tab4 = st.tabs([ui.TEXTS["tab_summary"], ui.TEXTS["tab_playtime"], ui.TEXTS["tab_region"], ui.TEXTS["tab_qa"]])
    
    with tab1:
        st.markdown(f"""<div class="toss-card"><h4 style="margin-top:0;">{ui.TEXTS['ai_one_liner_title']}</h4><p style="font-size:1.1rem;">❝ {ins.get("critic_one_liner", "")} ❞</p><span style="color:#888; font-size:0.9rem;">{ui.TEXTS['ai_one_liner_desc'].format(st.session_state.rel_date_str, st.session_state.game_name)}</span></div>""", unsafe_allow_html=True)
        
        c_m1, c_m2, c_m3 = st.columns(3)
        with c_m1: st.metric(ui.TEXTS["metric_official"], stats.get('official_desc', ui.TEXTS['steam_eval_none']), help=ui.TEXTS['tooltip_official'])
        with c_m2: st.metric(ui.TEXTS["metric_all"], stats['all_desc'], ui.TEXTS["metric_count"].format(stats['all_total']), help=ui.TEXTS['tooltip_all'])
        with c_m3: st.metric(ui.TEXTS["metric_recent"].format(st.session_state.recent_label), stats['recent_desc'], ui.TEXTS["metric_recent_count"].format(stats['recent_total']), help=st.session_state.smart_reason)
        
        st.markdown(ui.TEXTS["summary_briefing"]); st.info(ins.get('sentiment_analysis', ''))
        
        c1, c2 = st.columns(2)
        with c1:
            st.markdown(ui.TEXTS["trend_all"])
            for line in sort_sentiments(ins.get('final_summary_all', [])): st.write(render_colored_text(line))
        with c2:
            st.markdown(ui.TEXTS["trend_recent"].format(st.session_state.recent_label))
            st.caption(ui.TEXTS["date_period_info"].format(stats.get('collection_period', ''), st.session_state.smart_reason))
            for line in sort_sentiments(ins.get('final_summary_recent', [])): st.write(render_colored_text(line))

    with tab2:
        st.markdown(ui.TEXTS["playtime_title"], help=ui.TEXTS['tooltip_playtime'])
        pt = ins.get('playtime_analysis', {})
        if pt:
            if pt.get('comparison_insights'): st.warning(ui.TEXTS["insight_core"] + "\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
            p1, p2, p3 = st.columns(3)
            with p1:
                st.markdown(f"**{pt.get('newbie_title', ui.TEXTS['newbie_title_default'])}**")
                st.caption(ui.TEXTS["sample_opinion"].format(stats.get('newbie_total', 0), stats.get('newbie_avg', 0), stats.get('newbie_desc', ui.TEXTS['steam_eval_none'])))
                for l in sort_sentiments(pt.get('newbie_summary', [])): st.write(f"- {render_colored_text(l)}")
            with p2:
                st.markdown(f"**{pt.get('normal_title', ui.TEXTS['normal_title_default'])}**")
                st.caption(ui.TEXTS["sample_opinion"].format(stats.get('norm_total', 0), stats.get('norm_avg', 0), stats.get('norm_desc', ui.TEXTS['steam_eval_none'])))
                for l in sort_sentiments(pt.get('normal_summary', [])): st.write(f"- {render_colored_text(l)}")
            with p3:
                st.markdown(f"**{pt.get('core_title', ui.TEXTS['core_title_default'])}**")
                st.caption(ui.TEXTS["sample_opinion"].format(stats.get('core_total', 0), stats.get('core_avg', 0), stats.get('core_desc', ui.TEXTS['steam_eval_none'])))
                for l in sort_sentiments(pt.get('core_summary', [])): st.write(f"- {render_colored_text(l)}")

    with tab3:
        # 💡 [복구 완료] 날아갔던 이슈 픽, 뉴스, 카테고리 평가 블록 부활!
        col_i1, col_i2 = st.columns(2)
        with col_i1:
            st.markdown(ui.TEXTS["issue_pick_title"])
            for line in ins.get('ai_issue_pick', []): st.write(f"📍 {line}")
        with col_i2:
            st.markdown(ui.TEXTS["news_title"])
            news = st.session_state.news_data
            if news and news[0]:
                st.caption(f"🔗 [{news[3]}] {news[0]}")
                for line in ins.get('news_summary', []): st.write(f"• {line}")
            else: st.write(ui.TEXTS["no_news"])
        
        st.divider()
        st.markdown(ui.TEXTS["category_summary_title"])
        for cat in ins.get('global_category_summary', []):
            with st.expander(f"📌 {cat.get('category', '')}"):
                for line in sort_sentiments(cat.get('summary', [])): st.write(f"- {render_colored_text(line)}")
        st.divider()
        
        # 권역 & 국가 분석 시작
        st.markdown(ui.TEXTS["region_title"], help=ui.TEXTS['tooltip_region'])
        reg_data = ins.get('region_analysis', {})
        if reg_data.get('divergence_insight'): st.success(ui.TEXTS["divergence_insight"].format(reg_data['divergence_insight']))
        
        for reg in reg_data.get('regions', []):
            with st.expander(ui.TEXTS["region_expander"].format(reg.get('region'), reg.get('trend'))):
                st.caption(ui.TEXTS["keyword_label"].format(', '.join(reg.get('keywords', []))))
                for cat in reg.get('categories', []):
                    cat_name = cat.get('name', '')
                    if cat_name: st.markdown(f"**{render_colored_text(cat_name)}**")
                    for line in sort_sentiments(cat.get('summary', [])): st.write(f"- {render_colored_text(line)}")
        
        st.divider()
        st.markdown(ui.TEXTS["country_title"])
        st.caption(ui.TEXTS["country_analysis_desc"])
        
        for country in ins.get('country_analysis', []):
            st.markdown(ui.TEXTS["country_flag"].format(country.get('country', '')))
            for cat in country.get('categories', []):
                cat_name = cat.get('name', '')
                if cat_name: st.markdown(f"**{render_colored_text(cat_name)}**")
                
                for line in sort_sentiments(cat.get('summary', [])): 
                    st.write(f"- {render_colored_text(line)}")
                
                quote = cat.get('quote', {})
                if quote and quote.get('original'):
                    st.markdown(ui.TEXTS["quote_original"].format(quote.get('original')))
                    if quote.get('korean'): st.markdown(ui.TEXTS["quote_korean"].format(quote.get('korean')))

        st.divider(); st.markdown(ui.TEXTS["table_global_title"])
        st.warning(ui.TEXTS["disclaimer_language"])

        df_reg = pd.DataFrame([[r['rank'], r['region'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_region']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_region"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])
        try: styled_reg = df_reg.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
        except: styled_reg = df_reg.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
        st.markdown(ui.TEXTS["table_region_title"]); st.dataframe(styled_reg, hide_index=True, use_container_width=True)

        df_all = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_all']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])
        df_30 = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_30']], columns=[ui.TEXTS["col_rank"], ui.TEXTS["col_lang"], ui.TEXTS["col_count"], ui.TEXTS["col_ratio"], ui.TEXTS["col_pos"], ui.TEXTS["col_neg"], ui.TEXTS["col_eval"]])

        try:
            st_all_top = df_all.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_full = df_all.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_top = df_30.head(10).style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_full = df_30.style.map(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
        except:
            st_all_top = df_all.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_all_full = df_all.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_top = df_30.head(10).style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])
            st_30_full = df_30.style.applymap(apply_eval_color, subset=[ui.TEXTS["col_eval"]])

        st.markdown(ui.TEXTS["table_all_title"]); st.dataframe(st_all_top, hide_index=True, use_container_width=True)
        with st.expander(ui.TEXTS["toggle_all_table"]): st.dataframe(st_all_full, hide_index=True, use_container_width=True)
            
        st.markdown(ui.TEXTS["table_30_title"])
        if stats['days_since_release'] < 30: st.info(ui.TEXTS["info_30_days"])
        else:
            st.caption(ui.TEXTS["date_period_info"].format(stats.get('collection_period', ''), st.session_state.smart_reason))
            st.dataframe(st_30_top, hide_index=True, use_container_width=True)
            with st.expander(ui.TEXTS["toggle_30_table"]): st.dataframe(st_30_full, hide_index=True, use_container_width=True)

    with tab4:
        # QA 영역은 그대로
        pass
