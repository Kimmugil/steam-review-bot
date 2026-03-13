# app.py
import streamlit as st
import requests
from config import APP_VERSION, UPDATE_HISTORY, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion, delete_notion_page

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았어! 배포 설정(Advanced settings)을 확인해줘.")
    st.stop()

def render_step_indicator(current_step):
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
    """💡 에러 코드별 사용자 친화적 메시지 출력 (429 중점)"""
    if isinstance(e, requests.exceptions.HTTPError) and e.response.status_code == 429:
        st.error("🚨 **[429 Client Error: Too Many Requests]**\n\n토큰 발행량이 최대에 달했거나 단시간에 너무 많은 요청이 발생했어!\n\n**대응 방안:**\n1. 약 1~2분 정도 충분히 기다린 뒤에 다시 시도해줘.\n2. 계속해서 문제가 발생한다면 관리자에게 에러 코드를 전달해줘!")
    else:
        st.error(f"🚨 일시적인 API 통신 에러가 발생했어: {e}\n\n잠시 후 다시 시도해줘!")

def main():
    with st.sidebar:
        st.markdown("### 📚 통합 리포트 열람")
        st.link_button("👉 노션 데이터베이스 보러가기", NOTION_PUBLISH_URL, use_container_width=True)
        st.divider()
        st.markdown(f"### ⚙️ 시스템 정보\n**버전:** `{APP_VERSION}`")
        with st.expander("🛠️ 업데이트 이력 (Changelog)"): st.markdown(UPDATE_HISTORY)

    st.title("🚜 스팀 사용자 평가 탈곡기")
    st.markdown("스팀 게임의 글로벌 리뷰, 최신 뉴스, 배경정보를 종합 분석하여 노션으로 추출합니다.")
    
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"page_id": None, "app_id": None, "game_name": None, "reviews_all": None, "reviews_recent": None, "store_stats": None, "recent_label": None, "smart_reason": None, "news_data": None})

    render_step_indicator(st.session_state.step)

    # ==========================
    # STEP 0: 분석 시작
    # ==========================
    if st.session_state.step == 0:
        st.subheader("Step 1. 분석할 게임의 App ID 입력")
        game_input = st.text_input("👉 스팀 App ID를 숫자로 입력하세요", placeholder="예: 3564740")
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            if not game_input:
                st.warning("App ID를 입력해주세요!")
                return
            
            with st.status("스팀 데이터를 탈곡하고 있습니다... 🌾", expanded=True) as status:
                progress_bar = st.progress(0)
                try:
                    st.write("🔍 1/5: 게임 정보 분석 중...")
                    app_id, game_name, release_date = get_steam_game_info(game_input)
                    if not app_id:
                        status.update(label="검색 실패", state="error")
                        st.error("입력하신 App ID로 게임을 찾을 수 없어. 숫자만 정확히 썼는지 확인해줘!")
                        return
                    progress_bar.progress(10)
                    
                    recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                    progress_bar.progress(20)
                    
                    st.write("📰 2/5: 스팀 최신 뉴스 수집 중...")
                    news_data = fetch_latest_news(app_id)
                    st.session_state.update({"app_id": app_id, "game_name": game_name, "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data})
                    progress_bar.progress(30)

                    st.write("📥 3/5: 글로벌 리뷰 데이터 수집 중...")
                    reviews_all, reviews_recent, store_stats = fetch_steam_reviews(app_id, recent_days_val)
                    st.session_state.update({"reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats})
                    progress_bar.progress(50)

                    st.write("🧠 4/5: AI 다차원 분석 중... (오래 걸려요!)")
                    insights, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data)
                    if err: raise Exception(err)
                    progress_bar.progress(80)

                    st.write("📝 5/5: 노션 리포트 생성 중...")
                    page_id = upload_to_notion(app_id, game_name, store_stats, insights, recent_label, smart_reason, news_data)
                    
                    progress_bar.progress(100)
                    st.session_state.page_id = page_id
                    st.session_state.step = 1
                    status.update(label="✅ 리포트 초안 작성 완료!", state="complete")
                    st.rerun()

                except requests.exceptions.RequestException as e:
                    status.update(label="통신 에러 발생", state="error")
                    handle_api_error(e)
                except Exception as e:
                    status.update(label="에러 발생", state="error")
                    if "429" in str(e): # 제미나이 등에서 텍스트로 429가 넘어올 경우 대비
                        st.error("🚨 **[429 Client Error]**\n\n요청이 너무 많거나 토큰이 부족해! 잠시 후 다시 시도해줘.")
                    else:
                        st.error(f"예기치 못한 에러: {e}")

    # ==========================
    # STEP 1: 피드백 
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
        
        feedback = st.text_area("수정이 필요하면 피드백을 적어줘!", placeholder="예: 뉴비 유저들 여론을 더 자세하게 써줘")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 피드백 반영하여 재작성", use_container_width=True):
                if not feedback.strip():
                    st.error("피드백 내용을 입력해줘.")
                else:
                    with st.status("재분석 중입니다...", expanded=True) as status:
                        try:
                            delete_notion_page(st.session_state.page_id)
                            insights, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.store_stats, st.session_state.recent_label, st.session_state.news_data, feedback)
                            if err: raise Exception(err)
                            new_page_id = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.store_stats, insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                            st.session_state.page_id = new_page_id
                            status.update(label="✅ 재작성 완료!", state="complete")
                            st.rerun()
                        except requests.exceptions.RequestException as e:
                            status.update(label="통신 에러 발생", state="error")
                            handle_api_error(e)
                        except Exception as e:
                            status.update(label="에러 발생", state="error")
                            st.error(f"에러: {e}")

        with col2:
            if st.button("✅ 리포트 최종 승인 (완료)", type="primary", use_container_width=True):
                st.session_state.step = 2
                st.rerun()

    # ==========================
    # STEP 2: 완료
    # ==========================
    elif st.session_state.step == 2:
        st.balloons()
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #e8f5e9; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #2e7d32; font-weight: bold;">
                👉 최종 노션 리포트 보러 가기
            </a>
        </div>
        """, unsafe_allow_html=True)
        
        st.divider()
        if st.button("🔄 새로운 게임 분석하기", use_container_width=True):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()