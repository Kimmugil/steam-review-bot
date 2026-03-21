import streamlit as st
import random
import time
import threading
import re
import ui_texts as ui  
from config import APP_VERSION, NOTION_PUBLIC_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews
from ai_analyzer import analyze_with_gemini
import report_streamlit as ui_render
from report_notion import upload_to_notion

st.set_page_config(page_title=ui.TEXTS["main_title"], page_icon="🚜", layout="wide")

# 💡 [업데이트] 탭 영역이 상단에 고정되도록 CSS(Sticky) 완벽 적용!
st.markdown("""
    <style>
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #F04452; color: white; text-align: center; padding: 8px; font-weight: bold; z-index: 9999; }
        .main .block-container { padding-top: 50px; font-family: 'Pretendard', sans-serif; }
        .toss-card { background-color: var(--secondary-background-color); padding: 24px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .stProgress > div > div > div > div { background-color: #FFC000 !important; }
        button[kind="primary"] { background-color: #FFC000 !important; color: #111111 !important; border: none !important; font-weight: 700 !important; border-radius: 12px !important; padding: 10px 24px !important; }
        button[kind="primary"]:hover { background-color: #E5AC00 !important; }
        .small-history { font-size: 0.85rem; line-height: 1.5; }
        
        /* 🔥 스트림릿 탭 메뉴 상단 고정 매직 CSS */
        [data-testid="stTabs"] [data-baseweb="tab-list"] {
            position: sticky;
            top: 45px;
            z-index: 990;
            background-color: var(--background-color);
            padding-top: 10px;
            padding-bottom: 5px;
        }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV": st.markdown(f'<div class="fixed-banner">{ui.TEXTS["dev_banner"]}</div>', unsafe_allow_html=True)
if not GEMINI_API_KEY or not NOTION_TOKEN: st.error(ui.TEXTS["api_error"]); st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    st.progress(int((current_step + 1) * 33.3))
    cols = st.columns(3)
    steps = [ui.TEXTS["step_1"], ui.TEXTS["step_2"], ui.TEXTS["step_3"]]
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
        st.markdown(ui.TEXTS["env_label"].format(ENV_NAME)); st.divider()
        st.markdown(ui.TEXTS["recent_history_title"])
        if not st.session_state.history: st.caption(ui.TEXTS["no_history"])
        else:
            st.caption(ui.TEXTS["click_history"])
            for idx, h in enumerate(reversed(st.session_state.history[-5:])):
                if st.button(ui.TEXTS["btn_history_item"].format(h['game_name']), key=f"hist_{idx}_{h['app_id']}", use_container_width=True):
                    st.session_state.update({k: h.get(k) for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]})
                    st.session_state.step = 1; st.rerun()
        st.divider(); st.caption(ui.TEXTS["version_label"].format(APP_VERSION))
        with st.expander(ui.TEXTS["update_history_title"]): st.markdown(f"<div class='small-history'>\n\n{UPDATE_HISTORY}\n\n</div>", unsafe_allow_html=True)

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title(ui.TEXTS["main_title"])
        st.markdown(ui.TEXTS["main_desc"])
    with col_h2: st.write(""); st.link_button(ui.TEXTS["report_link"], NOTION_PUBLIC_URL, use_container_width=True)
    
    st.write(""); render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader(ui.TEXTS["step1_title"])
            raw_input = st.text_input("Input", placeholder=ui.TEXTS["input_placeholder"], label_visibility="collapsed")
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
                    st.markdown(ui.TEXTS["prompt_analyze_game"].format(game_candidate_name))
                    if game_candidate_date: st.caption(ui.TEXTS["prompt_release_date"].format(game_candidate_date.strftime('%Y년 %m월 %d일')))
                        
            if st.button(ui.TEXTS["btn_analyze"], use_container_width=True, type="primary"):
                if not app_id: st.warning(ui.TEXTS["warn_invalid_id"]); return
                
                target_name = game_candidate_name if game_candidate_name else "게임"
                with st.status(ui.TEXTS["status_analyzing"].format(target_name), expanded=True) as status:
                    try:
                        p_bar = st.progress(0); info_txt = st.empty()
                        info_txt.write(ui.TEXTS["loading_1"])
                        if not game_candidate_name: rid, name, rdate, img_url = get_steam_game_info(app_id)
                        else: name, rdate, img_url = game_candidate_name, game_candidate_date, game_candidate_img
                        if not rid: raise Exception(ui.TEXTS["loading_error_info"])
                        p_bar.progress(20)
                        
                        info_txt.write(ui.TEXTS["loading_2"])
                        rday, rlabel, rreason, rperiod = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate, rperiod)
                        if stats['all_total'] == 0: raise Exception(ui.TEXTS["loading_error_data"])
                        p_bar.progress(50)
                        
                        info_txt.write(ui.TEXTS["loading_3"])
                        ticker = st.empty(); res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        while not event.is_set(): ticker.info(f"💡 {random.choice(ui.TEXTS['WAITING_MESSAGES'])}"); time.sleep(TICKER_INTERVAL)
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({"app_id": rid, "game_name": name, "rel_date_str": rdate.strftime("%Y년 %m월 %d일"), "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r, "qa_history": [], "header_image": img_url})
                        history_item = {k: st.session_state[k] for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid] + [history_item]
                        
                        ticker.empty(); info_txt.write(ui.TEXTS["loading_4"]); p_bar.progress(100)
                        st.session_state.step = 1; status.update(label=ui.TEXTS["status_complete"], state="complete"); st.rerun()
                    except Exception as e: status.update(label=ui.TEXTS["status_error"], state="error"); st.error(str(e))

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] {ui.TEXTS['step2_title']}")
        st.info(ui.TEXTS['step2_desc'])
        
        ui_render.render_report_tabs()

        st.divider()
        with st.container(border=True):
            st.markdown(ui.TEXTS["publish_title"])
            col1, col2 = st.columns(2)
            with col1:
                if st.button(ui.TEXTS["btn_reset"], use_container_width=True):
                    for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history", "header_image"]: st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                if st.button(ui.TEXTS["btn_notion"], use_container_width=True, type="primary"):
                    with st.status(ui.TEXTS["publish_loading"]):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.rel_date_str, st.session_state.stats, st.session_state.insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data, st.session_state.qa_history)
                        if pid: st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.balloons(); st.success(ui.TEXTS["publish_success"])
        st.markdown(f'<div class="toss-card" style="text-align:center;"><a href="https://notion.so/{st.session_state.page_id.replace("-", "")}" target="_blank" style="font-size:1.5em; color:#3182F6; font-weight:700; text-decoration:none;">🔗 {ui.TEXTS["publish_link"]}</a></div>', unsafe_allow_html=True)
        
        if st.button(ui.TEXTS["btn_reset_after_publish"], use_container_width=True, type="primary"):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
