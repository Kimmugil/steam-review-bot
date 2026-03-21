import streamlit as st
import pandas as pd
import ui_texts as ui
from ai_analyzer import ask_followup_question

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
    return "color: #3182F6" if "긍정적" in v else ("color: #F04452" if "부정적" in v else "color: #888888")

def render_report_tabs():
    ins, stats = st.session_state.insights, st.session_state.stats
    
    st.info(f"**{ui.TEXTS['bot_info_title']}**\n\n{ui.TEXTS['bot_info_desc']}")
    
    tab1, tab2, tab3, tab4 = st.tabs(["📊 주요 요약", "⏱️ 플탐 분석", "🌐 권역 & 언어", "🙋‍♀️ AI 질문"])
    
    with tab1:
        st.markdown(f"""<div class="toss-card"><h4 style="margin-top:0;">🤖 AI 한줄평</h4><p style="font-size:1.1rem;">❝ {ins.get("critic_one_liner", "")} ❞</p><span style="color:#888; font-size:0.9rem;">{st.session_state.rel_date_str} 스팀에 출시된 [{st.session_state.game_name}]에 대한 AI 분석 결과입니다.</span></div>""", unsafe_allow_html=True)
        
        c_m1, c_m2, c_m3 = st.columns(3)
        with c_m1: st.metric("🛑 스팀 공식 평점", stats.get('official_desc', '평가 없음'), help=ui.TEXTS['tooltip_official'])
        with c_m2: st.metric("📈 전체 누적 평점", stats['all_desc'], f"{stats['all_total']:,}개", help=ui.TEXTS['tooltip_all'])
        with c_m3: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], f"{stats['recent_total']:,}개", help=st.session_state.smart_reason)
        
        st.markdown("##### 🎯 종합 여론 브리핑"); st.info(ins.get('sentiment_analysis', ''))
        
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("**📈 누적 여론 동향**")
            for line in sort_sentiments(ins.get('final_summary_all', [])): st.write(render_colored_text(line))
        with c2:
            st.markdown(f"**🔥 {st.session_state.recent_label} 동향**")
            st.caption(f"📅 집계 기간: {st.session_state.smart_reason}")
            for line in sort_sentiments(ins.get('final_summary_recent', [])): st.write(render_colored_text(line))

    with tab2:
        st.markdown("### ⏱️ 플레이타임별 민심 교차 분석", help=ui.TEXTS['tooltip_playtime'])
        pt = ins.get('playtime_analysis', {})
        if pt:
            if pt.get('comparison_insights'): st.warning("**⚖️ 핵심 인사이트**\n" + "\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
            p1, p2, p3 = st.columns(3)
            with p1:
                st.markdown(f"**{pt.get('newbie_title', '🌱 뉴비 (하위 25%)')}**")
                st.caption(f"표본: {stats.get('newbie_total', 0)}개 | 여론: {stats.get('newbie_desc', '평가 없음')}")
                for l in sort_sentiments(pt.get('newbie_summary', [])): st.write(f"- {render_colored_text(l)}")
            with p2:
                st.markdown(f"**{pt.get('normal_title', '🚶 일반 (중위 50%)')}**")
                st.caption(f"표본: {stats.get('norm_total', 0)}개 | 여론: {stats.get('norm_desc', '평가 없음')}")
                for l in sort_sentiments(pt.get('normal_summary', [])): st.write(f"- {render_colored_text(l)}")
            with p3:
                st.markdown(f"**{pt.get('core_title', '💀 코어 (상위 25%)')}**")
                st.caption(f"표본: {stats.get('core_total', 0)}개 | 여론: {stats.get('core_desc', '평가 없음')}")
                for l in sort_sentiments(pt.get('core_summary', [])): st.write(f"- {render_colored_text(l)}")

    with tab3:
        st.markdown("### 🗺️ 권역별 세부 평가 분석", help=ui.TEXTS['tooltip_region'])
        reg_data = ins.get('region_analysis', {})
        if reg_data.get('divergence_insight'): st.success(f"**💡 권역별 다이버전스 인사이트**\n\n{reg_data['divergence_insight']}")
        
        for reg in reg_data.get('regions', []):
            with st.expander(f"📍 {reg.get('region')} (동향: {reg.get('trend')})"):
                st.caption(f"🔑 주요 키워드: {', '.join(reg.get('keywords', []))}")
                for cat in reg.get('categories', []):
                    st.write(f"**{render_colored_text(cat.get('name'))}**: {' '.join(cat.get('summary', []))}")
        
        st.divider()
        st.markdown("### 🌍 리뷰 작성 언어(국가)별 분석")
        st.caption(ui.TEXTS["country_analysis_desc"])
        
        for country in ins.get('country_analysis', []):
            st.markdown(f"**🚩 {country.get('country', '')}**")
            for cat in country.get('categories', []):
                st.write(f"  - {render_colored_text(cat.get('name'))}: {', '.join([render_colored_text(x) for x in sort_sentiments(cat.get('summary', []))])}")
                quote = cat.get('quote', {})
                if quote and quote.get('original'):
                    st.markdown(f"> **원문:** {quote.get('original')}")
                    if quote.get('korean'): st.markdown(f"> **번역:** {quote.get('korean')}")

        st.divider(); st.markdown("### 🌐 글로벌 언어 및 권역 통계표")
        st.warning(ui.TEXTS["disclaimer_language"])

        df_reg = pd.DataFrame([[r['rank'], r['region'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_region']], columns=["순위", "권역", "리뷰 수", "비중", "👍 긍정 비율", "👎 부정 비율", "📊 평가 결과"])
        try: styled_reg = df_reg.style.map(apply_eval_color, subset=["📊 평가 결과"])
        except: styled_reg = df_reg.style.applymap(apply_eval_color, subset=["📊 평가 결과"])
        st.markdown("##### 🗺️ 주요 권역별 누적 리뷰 비중"); st.dataframe(styled_reg, hide_index=True, use_container_width=True)

        df_all = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_all']], columns=["순위", "언어", "리뷰 수", "비중", "👍 긍정 비율", "👎 부정 비율", "📊 평가 결과"])
        df_30 = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_30']], columns=["순위", "언어", "리뷰 수", "비중", "👍 긍정 비율", "👎 부정 비율", "📊 평가 결과"])

        try:
            st_all_top = df_all.head(10).style.map(apply_eval_color, subset=["📊 평가 결과"])
            st_all_full = df_all.style.map(apply_eval_color, subset=["📊 평가 결과"])
            st_30_top = df_30.head(10).style.map(apply_eval_color, subset=["📊 평가 결과"])
            st_30_full = df_30.style.map(apply_eval_color, subset=["📊 평가 결과"])
        except:
            st_all_top = df_all.head(10).style.applymap(apply_eval_color, subset=["📊 평가 결과"])
            st_all_full = df_all.style.applymap(apply_eval_color, subset=["📊 평가 결과"])
            st_30_top = df_30.head(10).style.applymap(apply_eval_color, subset=["📊 평가 결과"])
            st_30_full = df_30.style.applymap(apply_eval_color, subset=["📊 평가 결과"])

        st.markdown("##### 🥇 언어별 누적 리뷰 비중 TOP 10"); st.dataframe(st_all_top, hide_index=True, use_container_width=True)
        with st.expander("👀 언어별 누적 리뷰 비중 (전체 보기)"): st.dataframe(st_all_full, hide_index=True, use_container_width=True)
            
        st.markdown("##### 🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10")
        if stats['days_since_release'] < 30: st.info("ℹ️ 출시일로부터 30일 이후부터 지원하는 표입니다.")
        else:
            st.caption(f"📅 표 집계 기간: {st.session_state.smart_reason}")
            st.dataframe(st_30_top, hide_index=True, use_container_width=True)
            with st.expander("👀 최근 30일 누적 리뷰 비중 (전체보기)"): st.dataframe(st_30_full, hide_index=True, use_container_width=True)

    with tab4:
        st.markdown(f"### {ui.TEXTS['qa_title']}"); st.caption(ui.TEXTS['qa_desc'])
        if st.session_state.qa_history:
            for qa in st.session_state.qa_history: st.markdown(f"**Q. {qa['q']}**"); st.info(f"**A.** {qa['a']}")
        
        q_input = st.text_input("질문을 입력하세요:")
        if st.button("💬 질문하기", type="primary"):
            if q_input:
                with st.spinner("AI가 분석 중입니다..."):
                    ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                    if not err: st.session_state.current_q, st.session_state.current_a = q_input, ans; st.rerun()
        
        if st.session_state.get('current_a'):
            st.markdown("---"); st.markdown(f"**나의 질문:** {st.session_state.current_q}"); st.success(f"**🤖 AI:** {st.session_state.current_a}")
            if st.button("✅ 리포트에 추가"):
                st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                for h in st.session_state.history:
                    if h['app_id'] == st.session_state.app_id: h['qa_history'] = st.session_state.qa_history
                st.session_state.current_q, st.session_state.current_a = "", ""; st.rerun()
