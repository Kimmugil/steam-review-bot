# app.py
import streamlit as st
import requests
import random
import time
import threading
from config import APP_VERSION, UPDATE_HISTORY, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, WAITING_MESSAGES, TICKER_INTERVAL
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion, delete_notion_page

# 페이지 기본 설정
st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

# API 키 체크
if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았어! 배포 설정(Advanced settings)을 확인해줘.")
    st.stop()

def render_step_indicator(current_step):
    """현재 진행 단계를 시각적으로 표시"""
    steps = ["정보 입력", "검수 및 피드백", "분석 완료"]
    cols = st.columns(3)
    for i, col in enumerate(cols):
        if i < current_step:
            col.markdown(f"<div style='text-align: center; color: gray;'>✅ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        elif i == current_step:
            col.markdown(f"<div style='text-align: center; font-weight: bold; color: #0066cc;'>🟢 Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        else:
            col.markdown(f"<div style='text-align: center; color: lightgray;'>⚪ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
    st.divider()

def handle_api_error(e):
    """에러 메시지 처리 (보안 및 사용자 친화적 문구)"""
    error_str = str(e)
    if "429" in error_str:
        st.error("🚨 **[429 Client Error]**\n\n토큰 발행량이 최대에 달했거나 단시간에 너무 많은 요청이 발생했어!\n\n**대응 방안:** 약 1~2분 정도 기다린 뒤 다시 시도해줘.")
    else:
        # 보안을 위해 에러 메시지에 혹시라도 키가 포함되어 있다면 마스킹
        safe_msg = error_str.replace(GEMINI_API_KEY, "********") if GEMINI_API_KEY else error_str
        st.error(f"🚨 일시적인 에러가 발생했어: {safe_msg}\n\n잠시 후 다시 시도해줘!")

def main():
    # 사이드바 구성
    with st.sidebar:
        st.markdown("### 📚 통합 리포트 열람")
        st.link_button("👉 노션 데이터베이스 보러가기", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        st.markdown(f"### ⚙️ 시스템 정보\n**버전:** `{APP_VERSION}`")
        with st.expander("🛠️ 업데이트 이력 (Changelog)"):
            st.markdown(UPDATE_HISTORY)

    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 게임의 글로벌 리뷰, 최신 뉴스, 배경정보를 종합 분석하여 노션으로 추출합니다.")
    
    # 세션 상태 초기화
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({
            "page_id": None, "app_id": None, "game_name": None, 
            "reviews_all": None, "reviews_recent": None, "store_stats": None, 
            "recent_label": None, "smart_reason": None, "news_data": None
        })

    render_step_indicator(st.session_state.step)

    # ==========================
    # STEP 0: 정보 입력 및 분석 시작
    # ==========================
    if st.session_state.step == 0:
        st.subheader("Step 1. 분석할 게임의 App ID 입력")
        game_input = st.text_input("👉 스팀 App ID를 숫자로 입력하세요", placeholder="예: 3564740")
        
        with st.expander("❓ 스팀 App ID가 뭔가요? (찾는 방법)", expanded=True):
            st.markdown("""
            1. 브라우저에서 분석하고 싶은 스팀 상점 페이지에 접속합니다.
            2. 주소창의 URL을 확인합니다. (예: `https://store.steampowered.com/app/123450/Portal_2/`)
            3. `/app/` 다음에 나오는 **숫자(123450)**가 바로 App ID입니다!
            """)
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            if not game_input:
                st.warning("App ID를 입력해주세요!")
                return
            
            with st.status("스팀 데이터를 탈곡하고 있습니다... 🌾", expanded=True) as status:
                progress_bar = st.progress(0)
                try:
                    # 1. 게임 기본 정보 가져오기
                    st.write("🔍 1/5: 게임 정보 분석 중...")
                    app_id, game_name, release_date = get_steam_game_info(game_input)
                    if not app_id:
                        status.update(label="검색 실패", state="error")
                        st.error("입력하신 App ID로 게임을 찾을 수 없어. 숫자가 맞는지 다시 확인해줘!")
                        return
                    progress_bar.progress(10)
                    
                    # 2. 분석 기준 설정
                    recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                    progress_bar.progress(20)
                    
                    # 3. 최신 뉴스 및 리뷰 수집
                    st.write("📰 2/5: 스팀 최신 뉴스 수집 중...")
                    news_data = fetch_latest_news(app_id)
                    st.session_state.update({
                        "app_id": app_id, "game_name": game_name, 
                        "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data
                    })
                    progress_bar.progress(30)

                    st.write("📥 3/5: 글로벌 리뷰 데이터 수집 중...")
                    reviews_all, reviews_recent, store_stats = fetch_steam_reviews(app_id, recent_days_val)
                    st.session_state.update({
                        "reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats
                    })
                    progress_bar.progress(50)

                    # 4. AI 분석 (멀티스레딩 전광판 적용)
                    st.write("🧠 4/5: AI 다차원 분석 중... (가장 오래 걸리는 구간입니다)")
                    ticker_placeholder = st.empty()
                    
                    # 결과를 담을 박스와 완료 신호 이벤트
                    analysis_result = [None, None]  # [insights, error]
                    finish_event = threading.Event()

                    def run_analysis():
                        try:
                            res, err = analyze_with_gemini(
                                game_name, reviews_all, reviews_recent, 
                                store_stats, recent_label, news_data
                            )
                            analysis_result[0], analysis_result[1] = res, err
                        except Exception as ex:
                            analysis_result[1] = str(ex)
                        finally:
                            finish_event.set()

                    # 백그라운드에서 AI 분석 시작
                    thread = threading.Thread(target=run_analysis)
                    thread.start()

                    # 분석이 끝날 때까지 메인 스레드에서 전광판 롤링
                    last_msg = ""
                    while not finish_event.is_set():
                        new_msg = random.choice(WAITING_MESSAGES)
                        while new_msg == last_msg:
                            new_msg = random.choice(WAITING_MESSAGES)
                        
                        ticker_placeholder.info(f"💡 {new_msg}")
                        last_msg = new_msg
                        time.sleep(TICKER_INTERVAL)

                    insights, err = analysis_result[0], analysis_result[1]
                    if err: raise Exception(err)
                    
                    ticker_placeholder.empty()
                    progress_bar.progress(80)

                    # 5. 노션 업로드
                    st.write("📝 5/5: 노션 리포트 생성 중...")
                    page_id = upload_to_notion(app_id, game_name, store_stats, insights, recent_label, smart_reason, news_data)
                    
                    progress_bar.progress(100)
                    st.session_state.page_id = page_id
                    st.session_state.step = 1
                    status.update(label="✅ 리포트 초안 작성 완료!", state="complete")
                    st.rerun()

                except Exception as e:
                    status.update(label="에러 발생", state="error")
                    handle_api_error(e)

    # ==========================
    # STEP 1: 리포트 검수 및 피드백
    # ==========================
    elif st.session_state.step == 1:
        st.subheader("Step 2. 리포트 검수 및 피드백")
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #f0f2f6; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #0066cc; font-weight: bold;">
                👉 작성된 리포트 초안 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        feedback = st.text_area("수정이 필요하면 피드백을 적어줘!", placeholder="예: 뉴비 유저들의 조작감 불만 사항을 더 구체적으로 분석해줘")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 피드백 반영하여 재작성", use_container_width=True):
                if not feedback.strip():
                    st.error("피드백 내용을 입력해줘.")
                else:
                    with st.status("피드백을 반영하여 재분석 중...", expanded=True) as status:
                        try:
                            delete_notion_page(st.session_state.page_id)
                            insights, err = analyze_with_gemini(
                                st.session_state.game_name, st.session_state.reviews_all, 
                                st.session_state.reviews_recent, st.session_state.store_stats, 
                                st.session_state.recent_label, st.session_state.news_data, feedback
                            )
                            if err: raise Exception(err)
                            new_page_id = upload_to_notion(
                                st.session_state.app_id, st.session_state.game_name, 
                                st.session_state.store_stats, insights, 
                                st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data
                            )
                            st.session_state.page_id = new_page_id
                            status.update(label="✅ 재작성 완료!", state="complete")
                            st.rerun()
                        except Exception as e:
                            status.update(label="에러 발생", state="error")
                            handle_api_error(e)

        with col2:
            if st.button("✅ 리포트 최종 승인 (완료)", type="primary", use_container_width=True):
                st.session_state.step = 2
                st.rerun()

    # ==========================
    # STEP 2: 완료 및 새 작업 시작
    # ==========================
    elif st.session_state.step == 2:
        st.balloons()
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        st.success("🎉 분석 리포트가 최종적으로 완성되었습니다!")
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #e8f5e9; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #2e7d32; font-weight: bold;">
                👉 최종 노션 리포트 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.divider()
        if st.button("🔄 새로운 게임 분석하기", use_container_width=True):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()
