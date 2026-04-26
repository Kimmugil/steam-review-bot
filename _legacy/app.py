import streamlit as st
import random
import time
import threading
import re
import os
import base64
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
        .main .block-container { padding-top: 2rem; font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif; }
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #E24B4A; color: white; text-align: center; padding: 8px; font-weight: bold; z-index: 9999; }
        .small-history { font-size: 0.85rem; line-height: 1.5; }
        .stProgress > div > div > div > div { background-color: #222 !important; }

        /* 탭 상단 고정 */
        div[data-testid="stTabs"] > div:first-child {
            position: -webkit-sticky !important; position: sticky !important;
            top: 40px !important; z-index: 990 !important;
            background-color: var(--background-color) !important;
            padding-top: 10px !important; padding-bottom: 5px !important;
            border-bottom: 1px solid rgba(128,128,128,0.2) !important;
        }

        /* [2번 수정] 각 탭 패널 하단 스트림릿 자동 생성 구분선 제거 */
        div[data-testid="stTabs"] div[data-testid="stVerticalBlock"] > div:last-child hr,
        div[data-testid="stTabPanel"] > div > div:last-child hr { display: none !important; }
        /* st.divider()가 탭 마지막에 있을 때 숨김 */
        div[data-testid="stTabPanel"] hr:last-of-type { display: none !important; }

        /* Hero 섹션 (이미지+소개) */
        .hero-container { display: flex; gap: 2rem; align-items: center; background-color: rgba(128, 128, 128, 0.05); border-radius: 16px; padding: 2rem; margin-bottom: 2rem; }
        .hero-img { flex-shrink: 0; width: 320px; }
        .hero-img img { width: 100%; height: auto; max-height: 300px; border-radius: 12px; display: block; object-fit: cover; }
        .hero-text { flex: 1; min-width: 0; }
        .hero-text h2 { font-size: 24px; font-weight: bold; margin-bottom: 0.5rem; }
        .hero-text p { font-size: 16px; line-height: 1.7; color: var(--color-text-primary); margin: 0; }

        /* 스텝 인디케이터 */
        .step-indicators { display: flex; gap: 1rem; margin-bottom: 1.5rem; justify-content: start; }
        .step-dot { display: flex; align-items: center; gap: 8px; font-size: 15px; color: #888; }
        .step-dot.active { color: #222; font-weight: bold; }
        .step-dot.done { color: #555; }
        .step-circle { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; }
        .step-dot.active .step-circle { border-color: #222; background-color: #222; color: #fff; }
        .step-dot.done .step-circle { border-color: #555; background-color: transparent; color: #555; }

        /* 버튼 공통 스타일 */
        div[data-testid="stTextInput"] > div > div > input { border-radius: 10px !important; border: 1.5px solid rgba(128, 128, 128, 0.3) !important; padding: 10px 14px !important; font-size: 16px !important; }
        div[data-testid="stButton"] button { border-radius: 10px !important; font-weight: bold !important; padding: 10px 24px !important; }
        div[data-testid="stButton"] button[kind="primary"] { background-color: #222 !important; color: white !important; border: none !important; }

        /* 리포트 상단 게임 히어로 */
        .game-hero { display: flex; gap: 24px; align-items: stretch; margin-bottom: 1.5rem; }
        .game-hero-img { width: 260px; min-width: 260px; border-radius: 12px; overflow: hidden; flex-shrink: 0; }
        .game-hero-img img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
        .game-hero-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        .game-hero-name { font-size: 28px; font-weight: bold; margin-bottom: 4px; line-height: 1.3; }
        .game-hero-meta { font-size: 14px; color: rgba(128,128,128,0.8); margin-bottom: 16px; }
        .game-hero-oneliner { flex: 1; font-size: 17px; line-height: 1.7; font-style: italic; color: var(--color-text-primary); padding: 16px 20px; background: rgba(128,128,128,0.07); border-radius: 10px; display: flex; align-items: center; }

        /* [버그 수정] 발행 완료 화면 HTML 버튼 CSS — 기존 누락으로 링크가 스타일 없이 렌더링되던 문제 수정 */
        .finish-card { border: 1.5px solid rgba(128,128,128,0.25); border-radius: 14px; padding: 2.5rem 1.5rem; text-align: center; margin: 1.5rem 0; }
        .hbtn { display: block; padding: 11px 20px; border-radius: 10px; font-size: 15px; font-weight: 500; text-align: center; text-decoration: none; box-sizing: border-box; }
        .hbtn-filled { background: #1a1a1a; border: none; color: #fff !important; }
        .hbtn-filled:hover { background: #444; }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV":
    st.markdown(f'<div class="fixed-banner">{ui.TEXTS["dev_banner"]}</div>', unsafe_allow_html=True)
if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error(ui.TEXTS["api_error"]); st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_game_hero(game_name, rel_date_str, header_image, one_liner=""):
    img_html = f'<img src="{header_image}" alt="{game_name}">' if header_image else \
               f'<div style="width:100%;height:100%;background:rgba(128,128,128,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:40px;">🎮</div>'
    one_liner_html = f'<div class="game-hero-oneliner">❝ {one_liner} ❞</div>' if one_liner else ""
    released_label = ui.TEXTS.get("game_hero_released", "출시일")
    st.markdown(f'''
    <div class="game-hero">
        <div class="game-hero-img">{img_html}</div>
        <div class="game-hero-info">
            <div>
                <div class="game-hero-name">{game_name}</div>
                <div class="game-hero-meta">{released_label}: {rel_date_str}</div>
            </div>
            {one_liner_html}
        </div>
    </div>''', unsafe_allow_html=True)

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
    with col_h2:
        st.write("")
        st.link_button(ui.TEXTS["report_link"], NOTION_PUBLIC_URL, use_container_width=True)

    st.write("")

    # 스텝 인디케이터
    step_done_cls = "done" if st.session_state.step > 0 else ""
    step_active_cls = "active" if st.session_state.step == 0 else ""
    st.markdown(f'''
    <div class="step-indicators">
        <div class="step-dot {step_done_cls or step_active_cls}">
            <div class="step-circle">{"✓" if step_done_cls else "1"}</div>{ui.TEXTS["step_1"]}
        </div>
        <div class="step-dot {"active" if st.session_state.step == 1 else ("done" if st.session_state.step > 1 else "")}">
            <div class="step-circle">{"✓" if st.session_state.step > 1 else "2"}</div>{ui.TEXTS["step_2"]}
        </div>
        <div class="step-dot {"active" if st.session_state.step == 2 else ""}">
            <div class="step-circle">3</div>{ui.TEXTS["step_3"]}
        </div>
    </div>
    ''', unsafe_allow_html=True)

    # ── Step 0: 입력 ─────────────────────────────────────────────────────────
    if st.session_state.step == 0:
        hero_image_path = ui.TEXTS.get("hero_image_path", "image/tractor.png")

        if hero_image_path and os.path.exists(hero_image_path):
            with open(hero_image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode()
            img_src = f"data:image/png;base64,{encoded_string}"
            st.markdown(f'''
            <div class="hero-container">
                <div class="hero-img"><img src="{img_src}" alt="Tractor Hero"></div>
                <div class="hero-text">
                    <h2>{ui.TEXTS["hero_section_title"]}</h2>
                    <p>{ui.TEXTS["hero_section_desc"]}</p>
                </div>
            </div>''', unsafe_allow_html=True)
        else:
            # [버그 수정] 하드코딩 문자열 → ui_texts 키로 교체
            st.info(ui.TEXTS["hero_image_not_found"])

        with st.container(border=True):
            st.subheader(ui.TEXTS["step1_title"])
            st.markdown(f'<p style="color:#666; margin-bottom:1rem;">{ui.TEXTS["step1_caption"]}</p>', unsafe_allow_html=True)
            raw_input = st.text_input("Input", placeholder=ui.TEXTS["input_placeholder"], label_visibility="collapsed")

            app_id = extract_id(raw_input)
            game_candidate_name, game_candidate_date, game_candidate_img = None, None, None
            if app_id:
                rid, game_candidate_name, game_candidate_date, game_candidate_img = get_steam_game_info(app_id)

            if game_candidate_name:
                st.write("")
                img_col, txt_col = st.columns([1, 4])
                with img_col:
                    if game_candidate_img: st.image(game_candidate_img, use_container_width=True)
                with txt_col:
                    st.markdown(ui.TEXTS["prompt_analyze_game"].format(game_candidate_name))
                    if game_candidate_date:
                        st.caption(ui.TEXTS["prompt_release_date"].format(game_candidate_date.strftime('%Y년 %m월 %d일')))

            st.write("")
            if st.button(ui.TEXTS["btn_analyze"], use_container_width=True, type="primary"):
                if not app_id: st.warning(ui.TEXTS["warn_invalid_id"]); return
                target_name = game_candidate_name or ui.TEXTS["main_title"]
                with st.status(ui.TEXTS["status_analyzing"].format(target_name), expanded=True) as status:
                    try:
                        p_bar = st.progress(0)
                        info_txt = st.empty()

                        # [버그 수정] info_txt.write() → info_txt.markdown() 으로 교체
                        # write()는 HTML 스타일이 적용되지 않아 로딩 텍스트 크기/색상이 의도대로 나오지 않음
                        info_txt.markdown(f'<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">{ui.TEXTS["loading_1"]}</p>', unsafe_allow_html=True)
                        if not game_candidate_name:
                            rid, name, rdate, img_url = get_steam_game_info(app_id)
                        else:
                            name, rdate, img_url = game_candidate_name, game_candidate_date, game_candidate_img
                        if not rid: raise Exception(ui.TEXTS["loading_error_info"])
                        p_bar.progress(20)

                        info_txt.markdown(f'<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">{ui.TEXTS["loading_2"]}</p>', unsafe_allow_html=True)
                        rday, rlabel, rreason, rperiod = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate, rperiod)
                        if stats['all_total'] == 0: raise Exception(ui.TEXTS["loading_error_data"])
                        p_bar.progress(50)

                        info_txt.markdown(f'<p style="font-size:16px;color:rgba(100,100,100,0.9);margin:4px 0;">{ui.TEXTS["loading_3"]}</p>', unsafe_allow_html=True)
                        ticker = st.empty()
                        res_box, event = [None, None], threading.Event()

                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()

                        while not event.is_set():
                            ticker.info(f"💡 {random.choice(ui.TEXTS['WAITING_MESSAGES'])}")
                            time.sleep(TICKER_INTERVAL)
                        ticker.empty()
                        if res_box[1]: raise Exception(res_box[1])

                        st.session_state.update({
                            "app_id": rid, "game_name": name,
                            "rel_date_str": rdate.strftime("%Y년 %m월 %d일"),
                            "insights": res_box[0], "stats": stats, "recent_label": rlabel,
                            "news_data": news, "smart_reason": rreason,
                            "reviews_all": all_r, "reviews_recent": rec_r,
                            "qa_history": [], "header_image": img_url
                        })
                        history_item = {k: st.session_state[k] for k in ["app_id","game_name","rel_date_str","insights","stats","recent_label","news_data","smart_reason","reviews_all","reviews_recent","qa_history","header_image"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid] + [history_item]
                        st.session_state.step = 1
                        status.update(label=ui.TEXTS["status_complete"], state="complete")
                        st.rerun()
                    except Exception as e:
                        status.update(label=ui.TEXTS["status_error"], state="error")
                        st.error(str(e))

    # ── Step 1: 리포트 검수 ───────────────────────────────────────────────
    elif st.session_state.step == 1:
        one_liner = ""
        if st.session_state.insights:
            one_liner = re.sub(r'\*\*', '', str(st.session_state.insights.get("critic_one_liner", "")))
        render_game_hero(st.session_state.game_name, st.session_state.rel_date_str, st.session_state.header_image, one_liner)

        ui_render.render_report_tabs()

        st.divider()
        with st.container(border=True):
            st.markdown(f'<p style="font-size:16px;font-weight:bold;margin-bottom:1rem;">{ui.TEXTS["publish_title_label"]}</p>', unsafe_allow_html=True)
            col1, col2 = st.columns(2)
            with col1:
                if st.button(ui.TEXTS["btn_reset"], use_container_width=True):
                    for k in ["app_id","game_name","rel_date_str","insights","stats","recent_label","news_data","smart_reason","reviews_all","reviews_recent","qa_history","header_image"]:
                        st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                if st.button(ui.TEXTS["btn_notion"], use_container_width=True, type="primary"):
                    with st.status(ui.TEXTS["publish_loading"]):
                        pid = upload_to_notion(
                            st.session_state.app_id, st.session_state.game_name,
                            st.session_state.rel_date_str, st.session_state.stats,
                            st.session_state.insights, st.session_state.recent_label,
                            st.session_state.smart_reason, st.session_state.news_data,
                            st.session_state.qa_history)
                        if pid:
                            st.session_state.page_id = pid
                            st.session_state.step = 2; st.rerun()

    # ── Step 2: 발행 완료 ────────────────────────────────────────────────
    elif st.session_state.step == 2:
        st.balloons()
        st.success(ui.TEXTS["publish_success"])
        pid_clean = st.session_state.page_id.replace("-", "")
        # [버그 수정] .hbtn, .hbtn-filled CSS 클래스를 <style> 블록에 추가하여
        # 발행 완료 링크가 스타일 없이 렌더링되던 문제 수정
        st.markdown(f'''
        <div class="finish-card">
            <p style="font-size:14px;color:rgba(128,128,128,0.7);margin-bottom:16px;">{ui.TEXTS["publish_notion_released"]}</p>
            <a href="https://notion.so/{pid_clean}" target="_blank" class="hbtn hbtn-filled" style="max-width:360px;margin:0 auto 16px;display:block;">
                🔗 {ui.TEXTS["publish_link"]}
            </a>
        </div>''', unsafe_allow_html=True)

        st.write("")
        if st.button(ui.TEXTS["btn_reset_after_publish"], use_container_width=True, type="primary"):
            for k in [k for k in st.session_state.keys() if k != 'history']:
                del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
