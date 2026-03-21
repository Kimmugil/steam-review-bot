import streamlit as st
import random
import time
import threading
import re
import ui_texts as ui  
from config import APP_VERSION, NOTION_PUBLIC_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from messages import WAITING_MESSAGES
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews
from ai_analyzer import analyze_with_gemini
import report_streamlit as ui_render
from report_notion import upload_to_notion

st.set_page_config(page_title="스팀 리뷰 탈곡기", page_icon="🚜", layout="wide")

st.markdown("""
    <style>
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #F04452; color: white; text-align: center; padding: 8px; font-weight: bold; z-index: 9999; }
        .main .block-container { padding-top: 50px; font-family: 'Pretendard', sans-serif; }
        .toss-card { background-color: var(--secondary-background-color); padding: 24px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .stProgress > div > div > div > div { background-color: #FFC000 !important; }
        button[kind="primary"] { background-color: #FFC000 !important; color: #111111 !important; border: none !important; font-weight: 700 !important; border-radius: 12px !important; padding: 10px 24px !important; }
        button[kind="primary"]:hover { background-color: #E5AC00 !important; }
        .small-history { font-size: 0.85rem; line-height: 1.5; }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV": st.markdown('<div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 자유롭게 활용하세요.</div>', unsafe_allow_html=True)
if not GEMINI_API_KEY or not NOTION_TOKEN: st.error("🚨 API 키 설정이 누락되었습니다."); st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    st.progress(int((current_step + 1) * 33.3))
    cols = st.columns(3)
    steps = ["1️⃣ 분석 대상 입력", "2️⃣ 리포트 검수", "3️⃣ 발행 완료"]
    for i, col in enumerate(cols):
        color = "#FFC000" if i == current_step else ("#888" if i < current_step else "#444")
        weight = "bold" if i == current_step else "normal"
        col.markdown(f"<div style='text-align: center; color: {color}; font-weight: {weight};'> {steps[i]} </div>", unsafe_allow_html=True)
    st.write("")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None, "qa_history": [], "header_image": None})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`"); st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: st.caption("기록된 이력이 없습니다.")
        else:
            st.caption("👇 게임명을 클릭하면 과거 분석을 다시 볼 수 있습니다.")
            for idx, h in enumerate(reversed(st.session_state.history[-5:])):
                if st.button(f"🎮 {h['game_name']}", key=f"hist_{idx}_{h['app_id']}", use_container_width=True):
                    st.session_state.update({k: h.get(k) for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]})
                    st.session_state.step = 1; st.rerun()
        st.divider(); st.caption(f"Version: {APP_VERSION}")
        with st.expander("🛠️ 업데이트 이력"): st.markdown(f"<div class='small-history'>\n\n{UPDATE_HISTORY}\n\n</div>", unsafe_allow_html=True)

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title(ui.TEXTS["main_title"])
        st.markdown(ui.TEXTS["main_desc"])
    with col_h2: st.write(""); st.link_button("👉 통합 리포트 열람", NOTION_PUBLIC_URL, use_container_width=True)
    
    st.write(""); render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader(ui.TEXTS["step1_title"])
            raw_input = st.text_input("스팀 URL 또는 App ID", placeholder="예: https://store.steampowered.com/app/2215430", label_visibility="collapsed")
            st.caption(ui.TEXTS["step1_caption"])
            
            app_id = extract_id(raw_input)
            game_candidate_name, game_candidate_img, game_candidate_date = None, None, None
            
            if app_id: rid, game_candidate_name, game_candidate_date, game_candidate_img = get_steam_game_info(app_id)
            
            if game_candidate_name:
                st.markdown("---")
                img_col, txt_col = st.columns([1, 4])
                with img_col:
                    if game_candidate_img: st.image(game_candidate_img, use_container_width=True)
                with txt_col:
                    st.markdown(f"#### 🌾 **{game_candidate_name}** 리뷰를 탈곡할까요?")
                    if game_candidate_date: st.caption(f"이 게임은 {game_candidate_date.strftime('%Y년 %m월 %d일')} 스팀에 출시되었습니다.")
                        
            if st.button(ui.TEXTS["btn_analyze"], use_container_width=True, type="primary"):
                if not app_id: st.warning("유효한 App ID 또는 주소를 입력해 주세요."); return
                
                target_name = game_candidate_name if game_candidate_name else "게임"
                with st.status(f"[{target_name}] 스팀 리뷰 탈곡 중... 🌾", expanded=True) as status:
                    try:
                        p_bar = st.progress(0); info_txt = st.empty()
                        info_txt.write("🔍 1/5: 게임 기본 정보 확인 중...")
                        if not game_candidate_name: rid, name, rdate, img_url = get_steam_game_info(app_id)
                        else: name, rdate, img_url = game_candidate_name, game_candidate_date, game_candidate_img
                        if not rid: raise Exception("게임 정보 불러오기 실패")
                        p_bar.progress(20)
                        
                        info_txt.write("📥 2/5 & 3/5: 데이터 수집 중...")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate)
                        if stats['all_total'] == 0: raise Exception("데이터 없음")
                        p_bar.progress(50)
                        
                        info_txt.write("🧠 4/5: AI 다차원 분석 중...")
                        ticker = st.empty(); res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        while not event.is_set(): ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}"); time.sleep(TICKER_INTERVAL)
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({"app_id": rid, "game_name": name, "rel_date_str": rdate.strftime("%Y년 %m월 %d일"), "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r, "qa_history": [], "header_image": img_url})
                        history_item = {k: st.session_state[k] for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid] + [history_item]
                        
                        ticker.empty(); info_txt.write("✅ 5/5: 분석 완료!"); p_bar.progress(100)
                        st.session_state.step = 1; status.update(label="✅ 완료", state="complete"); st.rerun()
                    except Exception as e: status.update(label="에러", state="error"); st.error(str(e))

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] {ui.TEXTS['step2_title']}")
        st.info(ui.TEXTS['step2_desc'])
        
        # 💡 [핵심] 분리한 외부 모듈로 화면 그리기 통째로 위임!
        ui_render.render_report_tabs()

        st.divider()
        with st.container(border=True):
            st.markdown("### 📝 최종 발행 및 다음 스텝")
            col1, col2 = st.columns(2)
            with col1:
                if st.button(ui.TEXTS["btn_reset"], use_container_width=True):
                    for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]: st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                if st.button(ui.TEXTS["btn_notion"], use_container_width=True, type="primary"):
                    with st.status("노션으로 쏘는 중..."):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.rel_date_str, st.session_state.stats, st.session_state.insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data, st.session_state.qa_history)
                        if pid: st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.balloons(); st.success("🎉 리포트 발행 완료!")
        st.markdown(f'<div class="toss-card" style="text-align:center;"><a href="https://notion.so/{st.session_state.page_id.replace("-", "")}" target="_blank" style="font-size:1.5em; color:#3182F6; font-weight:700; text-decoration:none;">🔗 생성된 노션 리포트 확인하기</a></div>', unsafe_allow_html=True)
        if st.button(ui.TEXTS["btn_reset"], use_container_width=True, type="primary"):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
