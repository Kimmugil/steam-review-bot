# app.py
import streamlit as st
import requests
import random
import time
import threading
import re
from config import APP_VERSION, UPDATE_HISTORY, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, WAITING_MESSAGES, TICKER_INTERVAL
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion, delete_notion_page

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았어! 배포 설정을 확인해줘.")
    st.stop()

def extract_app_id(input_str):
    if not input_str: return None
    match = re.search(r'app/(\d+)', input_str)
    return match.group(1) if match else (input_str.strip() if input_str.strip().isdigit() else None)

def render_step_indicator(current_step):
    steps = ["정보 입력", "웹 프리뷰 및 검수", "최종 완료"]
    cols = st.columns(3)
    for i, col in enumerate(cols):
        if i < current_step: col.markdown(f"<div style='text-align: center; color: gray;'>✅ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        elif i == current_step: col.markdown(f"<div style='text-align: center; font-weight: bold; color: #0066cc;'>🟢 Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        else: col.markdown(f"<div style='text-align: center; color: lightgray;'>⚪ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
    st.divider()

def handle_api_error(e):
    if "429" in str(e): st.error("🚨 **[429 Client Error]**\n\n토큰 발행량이 최대에 달했어! 1~2분 뒤 다시 시도해줘.")
    else: st.error(f"🚨 일시적인 에러 발생: {str(e).replace(GEMINI_API_KEY, '********') if GEMINI_API_KEY else str(e)}")

def main():
    with st.sidebar:
        st.markdown("### 📚 통합 리포트 열람")
        st.link_button("👉 노션 데이터베이스 보러가기", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        st.markdown(f"### ⚙️ 시스템 정보\n**버전:** `{APP_VERSION}`")
        with st.expander("🛠️ 업데이트 이력"): st.markdown(UPDATE_HISTORY)

    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 상점 주소나 App ID를 입력하여 글로벌 여론을 탈탈 털어보세요.")
    
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"page_id": None, "app_id": None, "game_name": None, "reviews_all": None, "reviews_recent": None, "store_stats": None, "recent_label": None, "smart_reason": None, "news_data": None, "insights": None})

    render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        st.subheader("Step 1. 분석할 게임 정보 입력")
        raw_input = st.text_input("👉 스팀 상점 URL 또는 App ID를 입력하세요", placeholder="https://store.steampowered.com/app/2582960/...")
        with st.expander("❓ 스팀 App ID가 뭔가요? (찾는 방법)", expanded=True):
            st.markdown("1. 브라우저 주소창의 URL을 확인합니다. (예: `.../app/123450/`)\n2. `/app/` 다음에 나오는 **숫자(123450)**가 App ID입니다!")
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            app_id = extract_app_id(raw_input)
            if not app_id: st.warning("올바른 주소나 ID를 입력해줘!"); return
            with st.status("데이터를 수집하고 분석하는 중... 🌾", expanded=True) as status:
                progress_bar = st.progress(0)
                try:
                    real_id, game_name, release_date = get_steam_game_info(app_id)
                    if not real_id: st.error("게임 정보를 찾을 수 없어."); return
                    progress_bar.progress(10)
                    recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                    progress_bar.progress(20)
                    news_data = fetch_latest_news(real_id)
                    progress_bar.progress(30)
                    reviews_all, reviews_recent, store_stats = fetch_steam_reviews(real_id, recent_days_val)
                    if store_stats['all_total'] == 0: st.error(f"⚠️ [{game_name}] 게임은 아직 리뷰가 없습니다."); return
                    st.session_state.update({"app_id": real_id, "game_name": game_name, "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data, "reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats})
                    progress_bar.progress(50)

                    ticker_placeholder = st.empty()
                    res_box, finish_event = [None, None], threading.Event()
                    def run_analysis():
                        try: res, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data); res_box[0], res_box[1] = res, err
                        except Exception as ex: res_box[1] = str(ex)
                        finally: finish_event.set()
                    threading.Thread(target=run_analysis).start()
                    last_msg = ""
                    while not finish_event.is_set():
                        new_msg = random.choice(WAITING_MESSAGES)
                        while new_msg == last_msg: new_msg = random.choice(WAITING_MESSAGES)
                        ticker_placeholder.info(f"💡 {new_msg}"); last_msg = new_msg; time.sleep(TICKER_INTERVAL)
                    insights, err = res_box[0], res_box[1]
                    if err: raise Exception(err)
                    st.session_state.insights = insights
                    ticker_placeholder.empty(); progress_bar.progress(100)
                    st.session_state.step = 1; status.update(label="✅ 분석 완료!", state="complete"); st.rerun()
                except Exception as e: handle_api_error(e)

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 분석 결과 미리보기")
        ins = st.session_state.insights
        st.info(f"🤖 **AI 한줄평:** {ins.get('critic_one_liner', '')}")
        with st.expander("🎯 전 국가 망라 최종 요약 확인", expanded=True):
            col_all, col_rec = st.columns(2)
            with col_all:
                st.markdown("**📈 전체 누적 요약**")
                for line in ins.get('final_summary_all', []): st.write(f"- {line}")
            with col_rec:
                st.markdown(f"**🔥 {st.session_state.recent_label} 요약**")
                for line in ins.get('final_summary_recent', []): st.write(f"- {line}")
        with st.expander("🚨 AI 이슈 픽 및 인사이트"):
            for line in ins.get('ai_issue_pick', []): st.markdown(f"- {line}")
        st.divider(); feedback = st.text_area("수정이 필요한가요? 피드백을 적어주세요.")
        c1, c2 = st.columns(2)
        with c1:
            if st.button("🔄 피드백 반영하여 재분석", use_container_width=True):
                if not feedback.strip(): st.error("피드백을 입력해줘."); return
                with st.status("재분석 중...", expanded=True):
                    try:
                        res, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.store_stats, st.session_state.recent_label, st.session_state.news_data, feedback)
                        if err: raise Exception(err); st.session_state.insights = res; st.rerun()
                    except Exception as e: handle_api_error(e)
        with c2:
            if st.button("📤 노션으로 최종 리포트 전송", type="primary", use_container_width=True):
                with st.status("노션 전송 중...", expanded=True):
                    try:
                        st.session_state.page_id = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.store_stats, st.session_state.insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                        st.session_state.step = 2; st.rerun()
                    except Exception as e: handle_api_error(e)

    elif st.session_state.step == 2:
        st.balloons(); page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        st.success("🎉 분석 리포트가 노션에 안전하게 저장되었습니다!"); st.markdown(f'<div style="padding:20px;border-radius:10px;background-color:#e8f5e9;text-align:center;margin-bottom:20px;"><a href="{page_url}" target="_blank" style="font-size:1.5em;text-decoration:none;color:#2e7d32;font-weight:bold;">👉 최종 노션 리포트 열기</a></div>', unsafe_allow_html=True)
        if st.button("🔄 새로운 게임 탈곡하기", use_container_width=True):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__": main()
