import streamlit as st
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from messages import WAITING_MESSAGES
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

# CSS 주입: UI 개선 및 상단 배너 고정
st.markdown("""
    <style>
        .fixed-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background-color: #ff4b4b;
            color: white;
            text-align: center;
            padding: 8px;
            font-weight: bold;
            z-index: 9999;
        }
        .main .block-container {
            padding-top: 50px; 
        }
        .stats-card {
            background-color: #1e2129;
            padding: 20px;
            border-radius: 12px;
            border-left: 5px solid #ff4b4b;
            margin-bottom: 15px;
        }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV":
    st.markdown('<div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 자유롭게 활용하세요.</div>', unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 API 키 설정이 누락되었습니다. 관리자 설정을 확인해 주세요.")
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
        is_current = (i == current_step)
        color = "#ff4b4b" if is_current else ("#888" if i < current_step else "#444")
        weight = "bold" if is_current else "normal"
        col.markdown(f"<div style='text-align: center; color: {color}; font-weight: {weight};'> {steps[i]} </div>", unsafe_allow_html=True)
    st.write("")

def handle_api_error(e):
    error_str = str(e)
    if "429" in error_str:
        st.error("🚨 **[사용량 한계]**\n현재 AI 서버 호출량이 많습니다. 1분 정도 후에 다시 시도해 주세요.")
    elif "JSON_DECODE_ERROR" in error_str:
        st.error("🚨 **[분석 결과 오류]**\nAI가 분석 결과를 구성하는 중 문제가 발생했습니다. 재시도를 권장합니다.")
    else:
        st.error(f"🚨 시스템 에러: {error_str.replace(GEMINI_API_KEY, '********') if GEMINI_API_KEY else error_str}")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: st.caption("기록된 이력이 없습니다.")
        else:
            for h in reversed(st.session_state.history[-5:]):
                st.markdown(f"- **{h['name']}**")
        st.divider()
        st.caption(f"Version: {APP_VERSION}")
        with st.expander("🛠️ 업데이트 이력"): st.markdown(UPDATE_HISTORY)

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title("🚜 스팀 사용자 평가 탈곡기")
        st.markdown("스팀 상점 주소나 App ID를 통해 글로벌 리뷰 동향을 분석합니다.")
    with col_h2:
        st.write("")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLISH_URL, use_container_width=True)
    
    st.write("")
    render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader("🎮 Step 1. 분석 대상 입력")
            raw_input = st.text_input("스팀 URL 또는 App ID 입력", placeholder="https://store.steampowered.com/app/2215430/...", label_visibility="collapsed")
            
            with st.expander("❓ 스팀 App ID 확인 방법"):
                st.markdown("1. 스팀 상점 페이지 주소창 URL을 확인합니다.\n2. `/app/` 뒤에 오는 **숫자**가 해당 게임의 고유 ID입니다.")

            if st.button("🚀 데이터 분석 시작", use_container_width=True, type="primary"):
                app_id = extract_id(raw_input)
                if not app_id: st.warning("유효한 App ID 또는 주소를 입력해 주세요."); return
                
                with st.status("글로벌 데이터 수집 및 분석 중... 🌾", expanded=True) as status:
                    try:
                        p_bar = st.progress(0); info_txt = st.empty()
                        info_txt.write("🔍 1/5: 게임 기본 정보 확인 중...")
                        rid, name, rdate = get_steam_game_info(app_id)
                        if not rid:
                            status.update(label="검색 실패", state="error")
                            st.error("게임 정보를 불러올 수 없습니다. 입력하신 정보를 다시 확인해 주세요."); return
                        p_bar.progress(20)
                        
                        info_txt.write("📥 2/5 & 3/5: 최신 소식 및 리뷰 데이터 수집 중...")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday)
                        
                        if stats['all_total'] == 0: 
                            status.update(label="데이터 없음", state="error")
                            st.error(f"⚠️ [{name}] 분석할 리뷰 데이터가 존재하지 않습니다.")
                            return
                        p_bar.progress(50)
                        
                        info_txt.write("🧠 4/5: AI 다차원 분석 진행 중...")
                        ticker = st.empty()
                        res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        while not event.is_set():
                            ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}")
                            time.sleep(TICKER_INTERVAL)
                        
                        if res_box[1]: raise Exception(res_box[1])
                        st.session_state.update({"app_id": rid, "game_name": name, "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r})
                        if not any(h['id'] == rid for h in st.session_state.history):
                            st.session_state.history.append({"id": rid, "name": name})

                        ticker.empty(); info_txt.write("✅ 5/5: 분석 완료!"); p_bar.progress(100)
                        st.session_state.step = 1; status.update(label="✅ 분석 완료", state="complete"); st.rerun()
                    except Exception as e: 
                        status.update(label="에러 발생", state="error")
                        handle_api_error(e)

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 리포트 검수")
        ins = st.session_state.insights
        stats = st.session_state.stats
        
        tab1, tab2, tab3 = st.tabs(["📊 주요 요약", "⏱️ 플레이타임 분석", "🌐 상세 분석"])
        with tab1:
            st.markdown(f'<div class="stats-card"><b>💬 AI 평가 요약:</b><br>{ins.get("critic_one_liner", "")}</div>', unsafe_allow_html=True)
            col1, col2 = st.columns(2)
            with col1: st.metric("📈 전체 누적 평점", stats['all_desc'], f"{stats['all_total']:,}개")
            with col2: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], f"{stats['recent_total']:,}개")
            
            st.info(f"💡 **분석 요약:** {ins.get('sentiment_analysis', '')}")
            st.markdown("---")
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("##### 📈 누적 여론 동향")
                for line in ins.get('final_summary_all', []): st.write(line)
            with c2:
                st.markdown(f"##### 🔥 {st.session_state.recent_label} 동향")
                for line in ins.get('final_summary_recent', []): st.write(line)

        with tab2:
            st.markdown("### ⏱️ 플레이타임별 민심 교차 분석")
            pt = ins.get('playtime_analysis', {})
            if pt:
                if pt.get('comparison_insights'):
                    st.warning(f"**⚖️ 핵심 인사이트**\n\n" + "\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
                p1, p2 = st.columns(2)
                with p1:
                    st.markdown(f"**{pt.get('newbie_title', '🌱 신규 유저')}**")
                    for l in pt.get('newbie_summary', []): st.write(f"- {l}")
                with p2:
                    st.markdown(f"**{pt.get('core_title', '💀 숙련 유저')}**")
                    for l in pt.get('core_summary', []): st.write(f"- {l}")

        with tab3:
            col1, col2 = st.columns(2)
            with col1:
                st.markdown("### 🚨 주요 이슈 픽")
                for line in ins.get('ai_issue_pick', []): st.write(f"📍 {line}")
            with col2:
                st.markdown("### 📢 최신 소식")
                if st.session_state.news_data and st.session_state.news_data[0]:
                    st.caption(f"🔗 {st.session_state.news_data[0]}")
                    for line in ins.get('news_summary', []): st.write(f"• {line}")
                else: st.write("관련 소식이 없습니다.")
            
            st.divider()
            st.markdown("### 📁 세부 카테고리 평가")
            for cat in ins.get('global_category_summary', []):
                with st.expander(f"📌 {cat.get('category')}"):
                    for line in cat.get('summary', []): st.write(f"- {line}")
            
            st.divider()
            st.markdown("### 🌍 언어별 상세 리뷰")
            for country in ins.get('country_analysis', []):
                st.markdown(f"**[{country.get('language')}]**")
                for c_cat in country.get('categories', []):
                    st.write(f"  - {c_cat.get('name')}: {', '.join(c_cat.get('summary', []))}")

        st.divider()
        with st.container(border=True):
            st.markdown("### 📝 최종 검수 및 노션 전송")
            feedback = st.text_area("수정 요청 사항 (선택)", placeholder="특정 지표 강조나 리포트 보완 사항이 있다면 입력해 주세요.", label_visibility="collapsed")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔄 피드백 반영 재분석", use_container_width=True):
                    with st.status("분석 업데이트 중..."):
                        res, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.stats, st.session_state.recent_label, st.session_state.news_data, feedback)
                        if err: handle_api_error(err); return
                        st.session_state.insights = res; st.rerun()
            with col2:
                if st.button("📤 노션 리포트 최종 발행", type="primary", use_container_width=True):
                    with st.status("노션 페이지 생성 중..."):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                        st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.balloons()
        st.success("🎉 분석 리포트 발행이 완료되었습니다.")
        p_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        st.markdown(f'<div style="padding:30px; border-radius:15px; background-color:#1e2129; text-align:center;"><a href="{p_url}" target="_blank" style="font-size:1.5em; color:#ff4b4b; font-weight:bold; text-decoration:none;">🔗 생성된 노션 리포트 확인</a></div>', unsafe_allow_html=True)
        if st.button("🔄 다른 게임 분석하기", use_container_width=True):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
