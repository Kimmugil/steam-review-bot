import streamlit as st
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, NOTION_PUBLIC_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from messages import WAITING_MESSAGES
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini, ask_followup_question
from notion_exporter import upload_to_notion

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

def render_colored_text(text):
    if "[긍정]" in text: return f":blue[{text}]"
    elif "[부정]" in text: return f":red[{text}]"
    return text

st.markdown("""
    <style>
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #ff4b4b; color: white; text-align: center; padding: 8px; font-weight: bold; z-index: 9999; }
        .main .block-container { padding-top: 50px; }
        .stats-card { background-color: #1e2129; color: #ffffff; padding: 20px; border-radius: 12px; border-left: 5px solid #ff4b4b; margin-bottom: 15px; }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV": st.markdown('<div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 자유롭게 활용하세요.</div>', unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 API 키 설정이 누락되었습니다.")
    st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    progress_val = int((current_step + 1) * 33.3)
    st.progress(progress_val)
    cols = st.columns(3)
    steps = ["1️⃣ 정보 입력", "2️⃣ 결과 검수", "3️⃣ 전송 완료"]
    for i, col in enumerate(cols):
        color = "#ff4b4b" if i == current_step else ("#888" if i < current_step else "#444")
        weight = "bold" if i == current_step else "normal"
        col.markdown(f"<div style='text-align: center; color: {color}; font-weight: {weight};'> {steps[i]} </div>", unsafe_allow_html=True)
    st.write("")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None, "qa_history": []})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: 
            st.caption("기록된 이력이 없습니다.")
        else:
            st.caption("👇 게임명을 클릭하면 과거 분석을 다시 볼 수 있습니다.")
            for idx, h in enumerate(reversed(st.session_state.history[-5:])):
                if st.button(f"🎮 {h['game_name']}", key=f"hist_btn_{idx}_{h['app_id']}", use_container_width=True):
                    st.session_state.update({
                        "app_id": h['app_id'], "game_name": h['game_name'], "rel_date_str": h['rel_date_str'], 
                        "insights": h['insights'], "stats": h['stats'], "recent_label": h['recent_label'], 
                        "news_data": h['news_data'], "smart_reason": h['smart_reason'], 
                        "reviews_all": h['reviews_all'], "reviews_recent": h['reviews_recent'],
                        "qa_history": h.get('qa_history', [])
                    })
                    st.session_state.step = 1
                    st.rerun()
        st.divider()
        st.caption(f"Version: {APP_VERSION}")

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title("🚜 스팀 사용자 평가 탈곡기")
    with col_h2:
        st.write("")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLIC_URL, use_container_width=True)
    
    st.write("")
    render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader("🎮 Step 1. 분석 대상 입력")
            raw_input = st.text_input("스팀 URL 또는 App ID 입력", label_visibility="collapsed")
            if st.button("🚀 데이터 분석 시작", use_container_width=True, type="primary"):
                app_id = extract_id(raw_input)
                if not app_id: st.warning("유효한 App ID를 입력해 주세요."); return
                
                with st.status("글로벌 데이터 분석 중... 🌾", expanded=True) as status:
                    try:
                        rid, name, rdate = get_steam_game_info(app_id)
                        if not rid: raise Exception("게임 정보 불러오기 실패")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate)
                        if stats['all_total'] == 0: raise Exception("데이터 없음")
                        
                        res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        while not event.is_set(): time.sleep(TICKER_INTERVAL)
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({
                            "app_id": rid, "game_name": name, "rel_date_str": rdate.strftime("%Y년 %m월 %d일"), 
                            "insights": res_box[0], "stats": stats, "recent_label": rlabel, 
                            "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r,
                            "qa_history": []
                        })
                        history_item = {k: st.session_state[k] for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid]
                        st.session_state.history.append(history_item)
                        
                        st.session_state.step = 1; status.update(label="✅ 완료", state="complete"); st.rerun()
                    except Exception as e: status.update(label="에러", state="error"); st.error(str(e))

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 검수")
        ins, stats = st.session_state.insights, st.session_state.stats
        tab1, tab2, tab3, tab4 = st.tabs(["📊 요약", "⏱️ 플탐 분석", "🌐 상세 & 권역", "🙋‍♀️ Q&A"])
        
        with tab1:
            st.markdown(f'<div class="stats-card"><b>💬 AI 평가 요약:</b><br>{ins.get("critic_one_liner", "")}</div>', unsafe_allow_html=True)
            col1, col2, col3 = st.columns(3)
            with col1: st.metric("🛑 스팀 공식 평점", stats.get('official_desc', '평가 없음'))
            with col2: st.metric("📈 전체 누적 평점", stats['all_desc'], f"{stats['all_total']:,}개")
            with col3: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], f"{stats['recent_total']:,}개")
            st.info(f"💡 **분석 요약:** {ins.get('sentiment_analysis', '')}")

        with tab2:
            st.markdown("### ⏱️ 플레이타임별 민심 교차 분석")
            pt = ins.get('playtime_analysis', {})
            if pt:
                if pt.get('comparison_insights'): st.warning("**⚖️ 핵심 인사이트**\n" + "\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
                # 💡 [업데이트] 3분할 렌더링
                p1, p2, p3 = st.columns(3)
                with p1:
                    st.markdown(f"**{pt.get('newbie_title', '🌱 뉴비 (하위 25%)')}**")
                    st.caption(f"표본: {stats.get('newbie_total', 0)}개 | 여론: {stats.get('newbie_desc', '평가 없음')}")
                    for l in pt.get('newbie_summary', []): st.write(f"- {render_colored_text(l)}")
                with p2:
                    st.markdown(f"**{pt.get('normal_title', '🚶 일반 (중위 50%)')}**")
                    st.caption(f"표본: {stats.get('norm_total', 0)}개 | 여론: {stats.get('norm_desc', '평가 없음')}")
                    for l in pt.get('normal_summary', []): st.write(f"- {render_colored_text(l)}")
                with p3:
                    st.markdown(f"**{pt.get('core_title', '💀 코어 (상위 25%)')}**")
                    st.caption(f"표본: {stats.get('core_total', 0)}개 | 여론: {stats.get('core_desc', '평가 없음')}")
                    for l in pt.get('core_summary', []): st.write(f"- {render_colored_text(l)}")

        with tab3:
            # 💡 [업데이트] 권역별 세부 평가 분석 UI 렌더링
            st.markdown("### 🗺️ 권역별 세부 평가 분석")
            reg_data = ins.get('region_analysis', {})
            if reg_data.get('divergence_insight'):
                st.success(f"**💡 권역별 여론 다이버전스 인사이트**\n\n{reg_data['divergence_insight']}")
            
            for reg in reg_data.get('regions', []):
                with st.expander(f"📍 {reg.get('region')} (동향: {reg.get('trend')})"):
                    st.caption(f"🔑 주요 키워드: {', '.join(reg.get('keywords', []))}")
                    for cat in reg.get('categories', []):
                        st.write(f"**{render_colored_text(cat.get('name'))}**: {' '.join(cat.get('summary', []))}")
            st.divider()

            st.markdown("### 🌍 리뷰 작성 언어별 세부 평가 분석 (TOP 3 + 한국)")
            for country in ins.get('country_analysis', []):
                st.markdown(f"**[{country.get('language')}]**")
                for c_cat in country.get('categories', []):
                    st.write(f"  - {render_colored_text(c_cat.get('name'))}: {', '.join([render_colored_text(x) for x in c_cat.get('summary', [])])}")

            # 테이블 생략 없이 렌더링
            st.divider()
            st.markdown("### 🌐 언어 및 권역 표")
            st.dataframe(pd.DataFrame(stats['table_data_region']), hide_index=True, use_container_width=True)

        with tab4:
            st.markdown("### 🙋‍♀️ AI 추가 질문")
            if st.session_state.qa_history:
                for qa in st.session_state.qa_history:
                    st.markdown(f"**Q. {qa['q']}**"); st.info(f"**A.** {qa['a']}")
            
            q_input = st.text_input("질문을 입력하세요:")
            if st.button("💬 질문하기", type="primary"):
                if q_input:
                    ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                    if not err: st.session_state.current_q, st.session_state.current_a = q_input, ans; st.rerun()
            
            if st.session_state.get('current_a'):
                st.markdown("---")
                st.markdown(f"**나의 질문:** {st.session_state.current_q}")
                st.success(f"**🤖 AI:** {st.session_state.current_a}")
                if st.button("✅ 리포트에 추가"):
                    st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                    for h in st.session_state.history:
                        if h['app_id'] == st.session_state.app_id: h['qa_history'] = st.session_state.qa_history
                    st.session_state.current_q, st.session_state.current_a = "", ""; st.rerun()

        st.divider()
        with st.container(border=True):
            # 💡 [업데이트] 다른 게임 분석하기 버튼 분리 추가
            st.markdown("### 📝 최종 처리")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔄 노션 발행 없이 다른 게임 분석하기", use_container_width=True):
                    keys_to_clear = ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history"]
                    for k in keys_to_clear: st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                if st.button("📤 노션 리포트 최종 발행", type="primary", use_container_width=True):
                    with st.status("노션 전송 중..."):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.rel_date_str, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data, st.session_state.qa_history)
                        st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.success("🎉 발행 완료!")
        st.markdown(f'<a href="https://notion.so/{st.session_state.page_id.replace("-", "")}" target="_blank">🔗 리포트 열기</a>', unsafe_allow_html=True)
        if st.button("🔄 다른 게임 분석하기"):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
