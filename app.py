import streamlit as st
import time
import threading
from config import APP_VERSION, ENV_NAME, NOTION_PUBLIC_URL
from steam_api import get_steam_game_info, fetch_steam_reviews, fetch_latest_news, get_smart_period
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion
from messages import WAITING_MESSAGES
import random

# 💡 스트림릿 내에서 긍/부정 텍스트를 파랑/빨강으로 렌더링하는 헬퍼 함수
def render_colored_text(text):
    if "[긍정]" in text: return f":blue[{text}]"
    elif "[부정]" in text: return f":red[{text}]"
    return text

def main():
    st.set_page_config(page_title=f"스팀 탈곡기 {APP_VERSION}", layout="wide")
    
    col_title, col_link = st.columns([0.8, 0.2])
    with col_title:
        st.title("🚜 스팀 사용자 평가 탈곡기")
        st.caption("스팀 상점 주소나 App ID를 통해 글로벌 리뷰 동향을 분석합니다.")
    with col_link:
        if NOTION_PUBLIC_URL:
            st.link_button("👉 통합 리포트 열람", NOTION_PUBLIC_URL, use_container_width=True)
        else:
            st.button("👉 통합 리포트 열람 (URL 미설정)", disabled=True, use_container_width=True)

    if ENV_NAME == "DEV":
        st.warning(f"🛠️ 현재 {ENV_NAME} 환경에서 실행 중입니다. (v{APP_VERSION})")

    if "step" not in st.session_state: st.session_state.step = 1

    if st.session_state.step == 1:
        st.header("Step 1. 분석할 게임 정보 입력")
        game_input = st.text_input("스팀 App ID 또는 상점 URL을 입력하세요", placeholder="예: 123450")
        
        if st.button("탈곡 시작 🚀"):
            if game_input:
                with st.spinner("게임 정보를 확인하고 리뷰를 긁어오는 중..."):
                    app_id, game_name, rel_date = get_steam_game_info(game_input)
                    if app_id:
                        st.session_state.app_id = app_id
                        st.session_state.game_name = game_name
                        # 💡 [개선] 출시일 텍스트 저장
                        st.session_state.rel_date_str = rel_date.strftime("%Y년 %m월 %d일")
                        
                        days_val, label, reason = get_smart_period(rel_date)
                        st.session_state.recent_label = label
                        st.session_state.smart_reason = reason
                        
                        news_data = fetch_latest_news(app_id)
                        rev_all, rev_rec, stats = fetch_steam_reviews(app_id, days_val)
                        
                        st.session_state.news_data = news_data
                        st.session_state.rev_all = rev_all
                        st.session_state.rev_rec = rev_rec
                        st.session_state.stats = stats
                        
                        res_box = {"data": None, "error": None}
                        event = threading.Event()

                        def run_ai():
                            try:
                                res, err = analyze_with_gemini(game_name, rev_all, rev_rec, stats, label, news_data)
                                res_box["data"], res_box["error"] = res, err
                            finally:
                                event.set()

                        threading.Thread(target=run_ai).start()
                        
                        placeholder = st.empty()
                        while not event.is_set():
                            placeholder.info(random.choice(WAITING_MESSAGES))
                            time.sleep(3)
                        
                        if res_box["data"]:
                            st.session_state.ai_result = res_box["data"]
                            st.session_state.step = 2
                            st.rerun()
                        else:
                            st.error(f"AI 분석 실패: {res_box['error']}")
                    else:
                        st.error("올바른 스팀 ID나 URL을 입력해 주세요.")
            else:
                st.warning("내용을 입력해 주세요.")

    elif st.session_state.step == 2:
        st.header(f"Step 2. [{st.session_state.game_name}] 리포트 검수")
        # 💡 [개선] 앱 상단에 게임 출시일 렌더링
        st.write(f"📅 **스팀 출시일:** {st.session_state.rel_date_str}")
        
        ai_data = st.session_state.ai_result
        tab1, tab2, tab3 = st.tabs(["📊 주요 요약", "⏱️ 플레이타임 분석", "🌐 상세 분석"])
        
        with tab1:
            st.subheader("🤖 AI 평가 요약")
            st.info(ai_data.get('sentiment_analysis', '분석 중...'))
            st.write(f"**한줄평:** {ai_data.get('critic_one_liner', '')}")
            
        with tab2:
            st.subheader(ai_data.get('playtime_analysis', {}).get('newbie_title', '🌱 뉴비 여론'))
            for s in ai_data.get('playtime_analysis', {}).get('newbie_summary', []):
                st.write(f"- {render_colored_text(s)}")
            st.subheader(ai_data.get('playtime_analysis', {}).get('core_title', '💀 코어 여론'))
            for s in ai_data.get('playtime_analysis', {}).get('core_summary', []):
                st.write(f"- {render_colored_text(s)}")

        with tab3:
            st.subheader("🌍 언어별 주요 피드백")
            for country in ai_data.get('country_analysis', []):
                with st.expander(f"🚩 {country['language']}"):
                    for cat in country['categories']:
                        st.write(f"**{render_colored_text(cat['name'])}**")
                        for line in cat['summary']: 
                            st.write(f"- {render_colored_text(line)}")

        feedback = st.text_area("AI에게 추가로 요청할 수정사항이 있나요?", placeholder="예: 뉴비 의견을 더 보강해줘")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 다시 분석하기"):
                st.session_state.step = 1
                st.rerun()
        with col2:
            if st.button("✅ 최종 승인 및 노션 전송"):
                with st.spinner("노션으로 리포트를 전송하고 있습니다..."):
                    try:
                        # 💡 [개선] release_date_str 파라미터 추가 전송
                        pid = upload_to_notion(
                            st.session_state.app_id, 
                            st.session_state.game_name, 
                            st.session_state.rel_date_str,
                            st.session_state.stats, 
                            ai_data, 
                            st.session_state.recent_label, 
                            st.session_state.smart_reason, 
                            st.session_state.news_data
                        )
                        st.session_state.page_id = pid
                        st.session_state.step = 3
                        st.rerun()
                    except Exception as e:
                        st.error(f"전송 실패: {str(e)}")

    elif st.session_state.step == 3:
        st.balloons()
        st.success("🎉 노션 리포트 생성이 완료되었습니다!")
        st.link_button("📄 생성된 노션 리포트 확인하기", f"https://notion.so/{st.session_state.page_id.replace('-', '')}")
        if st.button("처음으로 돌아가기"):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()
