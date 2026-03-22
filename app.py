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

st.markdown("""
    <style>
        .main .block-container { padding-top: 2rem; padding-bottom: 3rem; }
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #E24B4A; color: white; text-align: center; padding: 7px; font-size: 14px; font-weight: 500; z-index: 9999; }
        .small-history { font-size: 0.85rem; line-height: 1.5; }

        /* 프로그레스바 */
        .stProgress > div > div > div > div { background-color: #222 !important; }

        /* 탭 상단 고정 */
        div[data-testid="stTabs"] > div:first-child {
            position: -webkit-sticky !important; position: sticky !important;
            top: 0 !important; z-index: 100 !important;
            background-color: var(--background-color) !important;
            padding-top: 8px !important;
            border-bottom: 1.5px solid rgba(128,128,128,0.2) !important;
        }

        /* AI 대기 슬라이딩 바 */
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(600%)} }
        .anim-bar-wrap { height: 4px; border-radius: 2px; background: rgba(128,128,128,0.2); overflow: hidden; margin: 12px 0 8px; }
        .anim-bar-inner { height: 100%; width: 16%; border-radius: 2px; background: #333; animation: shimmer 1.6s ease-in-out infinite; }

        /* HTML 버튼 */
        .hbtn { display: block; width: 100%; padding: 11px 20px; border-radius: 10px; font-size: 15px; font-weight: 500; text-align: center; text-decoration: none; box-sizing: border-box; }
        .hbtn-outline { background: transparent; border: 1.5px solid rgba(120,120,120,0.6); color: inherit !important; }
        .hbtn-outline:hover { background: rgba(128,128,128,0.08); }
        .hbtn-filled { background: #1a1a1a; border: none; color: #fff !important; }
        .hbtn-filled:hover { background: #444; }

        /* st.button 스타일 덮어쓰기 — CSS는 항상 페이지 최상단에서 한 번만 선언 */
        div[data-testid="stButton"] button {
            border: 1.5px solid rgba(120,120,120,0.55) !important;
            border-radius: 10px !important;
            font-size: 15px !important;
            font-weight: 500 !important;
        }
        div[data-testid="stButton"] button[kind="primary"],
        div[data-testid="stButton"] button[data-testid="baseButton-primary"] {
            background: #1a1a1a !important;
            color: #fff !important;
            border: none !important;
        }

        /* 스텝 인디케이터 */
        .step-wrap { display: flex; margin-bottom: 2.5rem; }
        .step-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10px; padding-bottom: 18px; position: relative; }
        .step-item::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; border-radius:2px; background:rgba(128,128,128,0.2); }
        .step-item.s-done::after  { background: rgba(128,128,128,0.5); }
        .step-item.s-active::after { background: #222; }
        .step-circle { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; border: 2px solid rgba(128,128,128,0.35); color: rgba(128,128,128,0.7); background: transparent; }
        .step-item.s-done  .step-circle { border-color: rgba(128,128,128,0.5); color: rgba(128,128,128,0.8); background: rgba(128,128,128,0.1); }
        .step-item.s-active .step-circle { border-color: #222; color: #fff; background: #222; }
        .step-label { font-size: 16px; text-align: center; line-height: 1.4; color: rgba(128,128,128,0.7); }
        .step-item.s-done  .step-label { color: rgba(128,128,128,0.85); }
        .step-item.s-active .step-label { color: #222; font-weight: 500; }

        /* 발행 완료 카드 */
        .finish-card { border: 1.5px solid rgba(128,128,128,0.25); border-radius: 14px; padding: 2.5rem 1.5rem; text-align: center; margin: 1.5rem 0; }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV":
    st.markdown(f'<div class="fixed-banner">{ui.TEXTS["dev_banner"]}</div>', unsafe_allow_html=True)
if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error(ui.TEXTS["api_error"]); st.stop()

def extract_id(s):
    if not s: return None
    m = re.search(r'app/(\d+)', s.strip())
    return m.group(1) if m else (s.strip() if s.strip().isdigit() else None)

def render_step_indicator(current_step):
    steps = [ui.TEXTS["step_1"], ui.TEXTS["step_2"], ui.TEXTS["step_3"]]
    items = []
    for i, label in enumerate(steps):
        if i < current_step:    cls, circle = "s-done",   "✓"
        elif i == current_step: cls, circle = "s-active", str(i+1)
        else:                   cls, circle = "",          str(i+1)
        items.append(f'<div class="step-item {cls}"><div class="step-circle">{circle}</div><div class="step-label">{label}</div></div>')
    st.markdown('<div class="step-wrap">' + "".join(items) + '</div>', unsafe_allow_html=True)

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None, "qa_history": [], "header_image": None})

    with st.sidebar:
        st.markdown(ui.TEXTS["env_label"].format(ENV_NAME)); st.divider()
        st.markdown(ui.TEXTS["recent_history_title"])
        if not st.session_state.history:
            st.caption(ui.TEXTS["no_history"])
        else:
            st.caption(ui.TEXTS["click_history"])
            for idx, h in enumerate(reversed(st.session_state.history[-5:])):
                if st.button(ui.TEXTS["btn_history_item"].format(h['game_name']), key=f"hist_{idx}_{h['app_id']}", use_container_width=True):
                    st.session_state.update({k: h.get(k) for k in ["app_id","game_name","rel_date_str","insights","stats","recent_label","news_data","smart_reason","reviews_all","reviews_recent","qa_history","header_image"]})
                    st.session_state.step = 1; st.rerun()
        st.divider()
        st.caption(ui.TEXTS["version_label"].format(APP_VERSION))
        with st.expander(ui.TEXTS["update_history_title"]):
            st.markdown(f"<div class='small-history'>\n\n{UPDATE_HISTORY}\n\n</div>", unsafe_allow_html=True)

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title(ui.TEXTS["main_title"])
        st.markdown(f'<p style="color:rgba(128,128,128,0.8);font-size:16px;margin-top:-0.5rem;">{ui.TEXTS["main_desc"]}</p>', unsafe_allow_html=True)
    with col_h2:
        st.write("")
        st.markdown(f'<a href="{NOTION_PUBLIC_URL}" target="_blank" class="hbtn hbtn-outline">{ui.TEXTS["report_link"]}</a>', unsafe_allow_html=True)

    st.write("")
    render_step_indicator(st.session_state.step)

    # ── Step 0 ───────────────────────────────────────────────────────────
    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader(ui.TEXTS["step1_title"])
            raw_input = st.text_input("Input", placeholder=ui.TEXTS["input_placeholder"], label_visibility="collapsed")
            st.caption(ui.TEXTS["step1_caption"])

            app_id = extract_id(raw_input)
            game_candidate_name, game_candidate_date, game_candidate_img = None, None, None
            if app_id:
                rid, game_candidate_name, game_candidate_date, game_candidate_img = get_steam_game_info(app_id)

            if game_candidate_name:
                st.markdown("---")
                img_col, txt_col = st.columns([1, 4])
                with img_col:
                    if game_candidate_img: st.image(game_candidate_img, use_container_width=True)
                with txt_col:
                    st.markdown(ui.TEXTS["prompt_analyze_game"].format(game_candidate_name))
                    if game_candidate_date:
                        st.caption(ui.TEXTS["prompt_release_date"].format(game_candidate_date.strftime('%Y년 %m월 %d일')))

            if st.button(ui.TEXTS["btn_analyze"], use_container_width=True, key="btn_analyze_main"):
                if not app_id: st.warning(ui.TEXTS["warn_invalid_id"]); return
                target_name = game_candidate_name or "게임"
                with st.status(ui.TEXTS["status_analyzing"].format(target_name), expanded=True) as status:
                    try:
                        p_bar = st.progress(0); info_txt = st.empty()
                        info_txt.markdown('<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">🔍 게임 기본 정보 확인 중...</p>', unsafe_allow_html=True)
                        if not game_candidate_name:
                            rid, name, rdate, img_url = get_steam_game_info(app_id)
                        else:
                            name, rdate, img_url = game_candidate_name, game_candidate_date, game_candidate_img
                        if not rid: raise Exception(ui.TEXTS["loading_error_info"])
                        p_bar.progress(20)

                        info_txt.markdown('<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">📥 스팀 리뷰 수집 중… <span style="font-size:14px;color:rgba(128,128,128,0.7);">(가장 오래 걸려요)</span></p>', unsafe_allow_html=True)
                        rday, rlabel, rreason, rperiod = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate, rperiod)
                        if stats['all_total'] == 0: raise Exception(ui.TEXTS["loading_error_data"])
                        p_bar.progress(55)

                        info_txt.markdown('<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">🧠 AI 다차원 분석 중… <span style="font-size:14px;color:rgba(128,128,128,0.7);">리뷰를 읽고 인사이트를 뽑고 있어요</span></p>', unsafe_allow_html=True)
                        anim_slot = st.empty(); ticker = st.empty()
                        anim_html = '<div class="anim-bar-wrap"><div class="anim-bar-inner"></div></div>'

                        res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()

                        prog = 55
                        while not event.is_set():
                            anim_slot.markdown(anim_html, unsafe_allow_html=True)
                            ticker.info(f"💡 {random.choice(ui.TEXTS['WAITING_MESSAGES'])}")
                            if prog < 93: prog += 1; p_bar.progress(prog)
                            time.sleep(TICKER_INTERVAL)

                        anim_slot.empty(); ticker.empty()
                        if res_box[1]: raise Exception(res_box[1])
                        info_txt.markdown('<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">✅ 분석 완료!</p>', unsafe_allow_html=True)
                        p_bar.progress(100)

                        st.session_state.update({"app_id": rid, "game_name": name, "rel_date_str": rdate.strftime("%Y년 %m월 %d일"), "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r, "qa_history": [], "header_image": img_url})
                        history_item = {k: st.session_state[k] for k in ["app_id","game_name","rel_date_str","insights","stats","recent_label","news_data","smart_reason","reviews_all","reviews_recent","qa_history","header_image"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid] + [history_item]
                        st.session_state.step = 1
                        status.update(label=ui.TEXTS["status_complete"], state="complete"); st.rerun()
                    except Exception as e:
                        status.update(label=ui.TEXTS["status_error"], state="error"); st.error(str(e))

    # ── Step 1 ───────────────────────────────────────────────────────────
    elif st.session_state.step == 1:
        # ① 게임명만 표시 (Step 2 · 게임명 → 게임명만)
        st.markdown(f'<p style="font-size:20px;font-weight:500;margin-bottom:1rem;">{st.session_state.game_name}</p>', unsafe_allow_html=True)
        ui_render.render_report_tabs()

        st.divider()
        with st.container(border=True):
            st.markdown('<p style="font-size:16px;font-weight:500;margin-bottom:1rem;">📝 최종 발행 및 다음 스텝</p>', unsafe_allow_html=True)
            col1, col2 = st.columns(2)
            with col1:
                # CSS는 이미 페이지 상단에서 선언됨 — col 안에 <style> 절대 넣지 않음
                if st.button(ui.TEXTS["btn_reset"], use_container_width=True, key="btn_reset_main"):
                    for k in ["app_id","game_name","rel_date_str","insights","stats","recent_label","news_data","smart_reason","reviews_all","reviews_recent","qa_history","header_image"]:
                        st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                # primary 타입 그대로 — 상단 CSS가 #1a1a1a 배경으로 덮어씀
                if st.button(ui.TEXTS["btn_notion"], use_container_width=True, type="primary", key="btn_notion_main"):
                    with st.status(ui.TEXTS["publish_loading"]):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.rel_date_str, st.session_state.stats, st.session_state.insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data, st.session_state.qa_history)
                        if pid:
                            st.session_state.page_id = pid
                            st.session_state.step = 2; st.rerun()

    # ── Step 2 ───────────────────────────────────────────────────────────
    elif st.session_state.step == 2:
        st.balloons()
        st.success(ui.TEXTS["publish_success"])
        pid_clean = st.session_state.page_id.replace("-", "")
        st.markdown(f'''
        <div class="finish-card">
            <p style="font-size:14px;color:rgba(128,128,128,0.7);margin-bottom:16px;">노션 리포트가 발행되었습니다</p>
            <a href="https://notion.so/{pid_clean}" target="_blank" class="hbtn hbtn-filled" style="max-width:360px;margin:0 auto 16px;">
                🔗 {ui.TEXTS["publish_link"]}
            </a>
        </div>''', unsafe_allow_html=True)
        st.write("")
        if st.button(ui.TEXTS["btn_reset_after_publish"], use_container_width=True, key="btn_reset_after"):
            for k in [k for k in st.session_state.keys() if k != 'history']:
                del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
