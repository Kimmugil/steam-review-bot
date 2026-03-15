# app.py
import streamlit as st
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, UPDATE_HISTORY, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, WAITING_MESSAGES, TICKER_INTERVAL, ENV_NAME
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

# 환경 식별 배너
if ENV_NAME == "DEV":
    st.markdown('<div style="background-color:#ff4b4b;padding:5px;border-radius:5px;text-align:center;color:white;font-weight:bold;margin-bottom:20px;">🚧 개발 환경 (DEV MODE)</div>', unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 Secrets 설정이 필요합니다.")
    st.stop()

def extract_id(s):
    m = re.search(r'app/(\d+)', s)
    return m.group(1) if m else (s.strip() if s.strip().isdigit() else None)

def main():
    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        st.caption(f"Version: {APP_VERSION}")

    st.title("🚜 스팀 사용자 평가 탈곡기")
    
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None})

    if st.session_state.step == 0:
        raw_input = st.text_input("스팀 상점 URL 또는 App ID", placeholder="https://store.steampowered.com/app/...")
        if st.button("🚀 탈곡 시작", use_container_width=True, type="primary"):
            app_id = extract_id(raw_input)
            if not app_id: st.warning("ID를 확인해주세요."); return
            
            with st.status("분석 중... 🌾", expanded=True) as status:
                try:
                    p = st.progress(0); txt = st.empty()
                    txt.write("🔍 게임 정보 확인 중...")
                    rid, name, rdate = get_steam_game_info(app_id)
                    p.progress(20)
                    
                    txt.write("📥 리뷰 수집 중...")
                    rday, rlabel, rreason = get_smart_period(rdate)
                    news = fetch_latest_news(rid)
                    all_r, rec_r, stats = fetch_steam_reviews(rid, rday)
                    p.progress(50)
                    
                    txt.write("🧠 AI 다차원 분석 중 (전광판 가동)...")
                    ticker = st.empty()
                    res_box, event = [None, None], threading.Event()
                    def run():
                        try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                        except Exception as e: res_box[1] = str(e)
                        finally: event.set()
                    threading.Thread(target=run).start()
                    while not event.is_set():
                        ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}")
                        time.sleep(TICKER_INTERVAL)
                    
                    if res_box[1]: raise Exception(res_box[1])
                    st.session_state.update({"app_id": rid, "game_name": name, "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason})
                    st.session_state.step = 1; status.update(label="분석 완료!", state="complete"); st.rerun()
                except Exception as e: st.error(f"에러: {e}")

    elif st.session_state.step == 1:
        st.subheader(f"[{st.session_state.game_name}] 프리뷰")
        ins = st.session_state.insights
        st.success(f"**AI 한줄평:** {ins.get('critic_one_liner')}")
        
        # 상세 프리뷰 생략 (기존과 동일)
        if st.button("📤 노션 전송", type="primary", use_container_width=True):
            pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
            st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.balloons()
        st.success("노션 전송 완료!")
        if st.button("🔄 처음으로"):
            for k in list(st.session_state.keys()): del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
