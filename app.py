# app.py
import streamlit as st
import requests
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, UPDATE_HISTORY, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, WAITING_MESSAGES, TICKER_INTERVAL, LANG_MAP
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion, delete_notion_page

# 페이지 기본 설정
st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

# API 키 체크
if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 스트림릿 Secrets 금고에 API 키가 설정되지 않았어! 배포 설정(Advanced settings)을 확인해줘.")
    st.stop()

def extract_app_id(input_str):
    """주소 전체에서 App ID 숫자만 추출하거나 입력된 숫자를 반환"""
    if not input_str: return None
    match = re.search(r'app/(\d+)', input_str)
    if match:
        return match.group(1)
    if input_str.strip().isdigit():
        return input_str.strip()
    return None

def render_step_indicator(current_step):
    """현재 진행 단계를 시각적으로 표시"""
    steps = ["정보 입력", "웹 프리뷰 및 검수", "최종 완료"]
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
        safe_msg = error_str.replace(GEMINI_API_KEY, "********") if GEMINI_API_KEY else error_str
        st.error(f"🚨 일시적인 에러 발생: {safe_msg}")

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
    st.markdown("스팀 상점 주소나 App ID를 입력하여 글로벌 여론을 탈탈 털어보세요.")
    
    # 세션 상태 초기화
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({
            "page_id": None, "app_id": None, "game_name": None, 
            "reviews_all": None, "reviews_recent": None, "store_stats": None, 
            "recent_label": None, "smart_reason": None, "news_data": None, "insights": None
        })

    render_step_indicator(st.session_state.step)

    # ==========================
    # STEP 0: 정보 입력 및 분석
    # ==========================
    if st.session_state.step == 0:
        st.subheader("Step 1. 분석할 게임 정보 입력")
        raw_input = st.text_input("👉 스팀 상점 URL 또는 App ID를 입력하세요", placeholder="https://store.steampowered.com/app/2582960/...")
        
        with st.expander("❓ 스팀 App ID가 뭔가요? (찾는 방법)", expanded=True):
            st.markdown("""
            1. 브라우저에서 분석하고 싶은 스팀 상점 페이지에 접속합니다.
            2. 주소창의 URL을 확인합니다. (예: `https://store.steampowered.com/app/123450/Portal_2/`)
            3. `/app/` 다음에 나오는 **숫자(123450)**가 바로 App ID입니다!
            """)
        
        if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
            app_id = extract_app_id(raw_input)
            if not app_id:
                st.warning("올바른 스팀 주소나 App ID를 입력해주세요!")
                return
            
            with st.status("데이터를 수집하고 분석하는 중... 🌾", expanded=True) as status:
                progress_bar = st.progress(0)
                try:
                    st.write("🔍 1/5: 게임 기본 정보 확인 중...")
                    real_id, game_name, release_date = get_steam_game_info(app_id)
                    if not real_id:
                        status.update(label="검색 실패", state="error")
                        st.error("게임 정보를 불러올 수 없습니다. 주소나 ID를 확인해주세요.")
                        return
                    progress_bar.progress(10)
                    
                    recent_days_val, recent_label, smart_reason = get_smart_period(release_date)
                    progress_bar.progress(20)
                    
                    st.write("📰 2/5: 최신 패치노트 수집 중...")
                    news_data = fetch_latest_news(real_id)
                    progress_bar.progress(30)

                    st.write("📥 3/5: 글로벌 리뷰 데이터 추출 중...")
                    reviews_all, reviews_recent, store_stats = fetch_steam_reviews(real_id, recent_days_val)
                    
                    # 제로 리뷰 방어 로직
                    if store_stats['all_total'] == 0:
                        status.update(label="분석 불가", state="error")
                        st.error(f"⚠️ **[{game_name}]** 게임은 아직 등록된 리뷰가 없습니다. 리뷰가 쌓인 후에 다시 시도해주세요!")
                        return
                    
                    st.session_state.update({
                        "app_id": real_id, "game_name": game_name, 
                        "recent_label": recent_label, "smart_reason": smart_reason, "news_data": news_data,
                        "reviews_all": reviews_all, "reviews_recent": reviews_recent, "store_stats": store_stats
                    })
                    progress_bar.progress(50)

                    st.write("🧠 4/5: AI PM이 데이터를 분석 중입니다... (가장 오래 걸려요!)")
                    ticker_placeholder = st.empty()
                    res_box, finish_event = [None, None], threading.Event()
                    
                    def run_analysis():
                        try:
                            res, err = analyze_with_gemini(game_name, reviews_all, reviews_recent, store_stats, recent_label, news_data)
                            res_box[0], res_box[1] = res, err
                        except Exception as ex: res_box[1] = str(ex)
                        finally: finish_event.set()

                    threading.Thread(target=run_analysis).start()
                    last_msg = ""
                    while not finish_event.is_set():
                        new_msg = random.choice(WAITING_MESSAGES)
                        while new_msg == last_msg: new_msg = random.choice(WAITING_MESSAGES)
                        ticker_placeholder.info(f"💡 {new_msg}")
                        last_msg = new_msg
                        time.sleep(TICKER_INTERVAL)

                    insights, err = res_box[0], res_box[1]
                    if err: raise Exception(err)
                    
                    st.session_state.insights = insights
                    ticker_placeholder.empty()
                    progress_bar.progress(100)
                    st.session_state.step = 1
                    status.update(label="✅ 분석이 완료되었습니다!", state="complete")
                    st.rerun()

                except Exception as e:
                    status.update(label="에러 발생", state="error"); handle_api_error(e)

    # ==========================
    # STEP 1: 웹 프리뷰 및 피드백
    # ==========================
    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 분석 결과 미리보기")
        
        ins = st.session_state.insights
        stats = st.session_state.store_stats
        
        # 1. 상단 개요
        st.success(f"**💬 AI 한줄평:** {ins.get('critic_one_liner', '')}")
        
        col_s1, col_s2 = st.columns(2)
        with col_s1:
            st.metric("📈 전체 누적 평가", stats['all_desc'], delta=f"{stats['all_total']:,}개")
        with col_s2:
            st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], delta=f"표본 {stats['recent_total']:,}개", delta_color="inverse")

        st.info(f"💡 **분석 근거:** {ins.get('sentiment_analysis', '')}")

        # 2. 최종 요약 섹션
        st.markdown("---")
        st.markdown("### 🎯 전 국가 망라 최종 요약")
        c_all, c_rec = st.columns(2)
        with c_all:
            st.markdown("##### 📈 전체 누적 주요 여론")
            for line in ins.get('final_summary_all', []):
                st.write(line)
        with c_rec:
            st.markdown(f"##### 🔥 {st.session_state.recent_label} 주요 여론")
            for line in ins.get('final_summary_recent', []):
                st.write(line)

        # 3. 플레이타임별 분석 (신규 프리뷰 추가)
        st.markdown("---")
        st.markdown("### ⏱️ 플레이타임별 주요 민심 교차 분석")
        pt_data = ins.get('playtime_analysis', {})
        if pt_data:
            if pt_data.get('comparison_insights'):
                st.warning(f"**⚖️ 핵심 교차 체크포인트**\n\n" + "\n".join([f"- {i}" for i in pt_data.get('comparison_insights', [])]))
            
            p_col1, p_col2 = st.columns(2)
            with p_col1:
                st.markdown(f"**{pt_data.get('newbie_title', '🌱 뉴비 여론')}**")
                for line in pt_data.get('newbie_summary', []): st.write(f"- {line}")
            with p_col2:
                st.markdown(f"**{pt_data.get('core_title', '💀 코어 유저 여론')}**")
                for line in pt_data.get('core_summary', []): st.write(f"- {line}")

        # 4. 이슈 픽 및 뉴스 (신규 프리뷰 추가)
        st.markdown("---")
        st.markdown("### 🚨 AI 이슈 픽 & 📢 최신 소식")
        i_col1, i_col2 = st.columns(2)
        with i_col1:
            st.markdown("**[AI 이슈 픽]**")
            for line in ins.get('ai_issue_pick', []): st.write(f"📍 {line}")
        with i_col2:
            st.markdown("**[최신 공지/업데이트 요약]**")
            if st.session_state.news_data:
                st.caption(f"🔗 [{st.session_state.news_data[3]}] {st.session_state.news_data[0]}")
                for line in ins.get('news_summary', []): st.write(f"• {line}")
            else:
                st.write("관련 소식이 없습니다.")

        # 5. 카테고리별 / 언어비중 / 국가별 (신규 프리뷰 추가)
        with st.expander("🔍 상세 카테고리 및 국가별 분석 보기"):
            st.markdown("#### 📁 카테고리별 종합 평가")
            for cat in ins.get('global_category_summary', []):
                st.markdown(f"**{cat.get('category')}**")
                for line in cat.get('summary', []): st.write(f"  - {line}")
            
            st.markdown("---")
            st.markdown("#### 🌐 전 세계 누적 리뷰 언어 비중")
            sorted_langs = sorted(stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:10]
            lang_df = pd.DataFrame([
                {"순위": f"{i+1}위", "언어": get_lang_name(l[0]), "리뷰 수": f"{l[1]:,}개", "비중": f"{(l[1]/stats['all_total'])*100:.1f}%"}
                for i, l in enumerate(sorted_langs)
            ])
            st.table(lang_df)
            
            st.markdown("---")
            st.markdown("#### 🌍 국가별 세부 평가")
            for country in ins.get('country_analysis', []):
                st.markdown(f"**🚩 {country.get('language')}**")
                for c_cat in country.get('categories', []):
                    st.write(f"- {c_cat.get('name')}: {', '.join(c_cat.get('summary', []))}")

        # 6. 피드백 및 전송
        st.divider()
        st.markdown("### 📝 최종 검수 및 전송")
        feedback = st.text_area("내용이 마음에 들지 않나요? 피드백을 적어주시면 AI가 다시 분석합니다.", placeholder="예: 그래픽에 대한 긍정적인 평가를 좀 더 강조해서 정리해줘.")
        
        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("🔄 피드백 반영하여 재분석", use_container_width=True):
                if not feedback.strip(): st.error("피드백을 입력해줘."); return
                with st.status("피드백 반영 중...", expanded=True):
                    try:
                        res, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.store_stats, st.session_state.recent_label, st.session_state.news_data, feedback)
                        if err: raise Exception(err)
                        st.session_state.insights = res
                        st.rerun()
                    except Exception as e: handle_api_error(e)
        with btn_col2:
            if st.button("📤 노션으로 최종 리포트 전송", type="primary", use_container_width=True):
                with st.status("노션 페이지 생성 중...", expanded=True) as status:
                    try:
                        page_id = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.store_stats, st.session_state.insights, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                        st.session_state.page_id = page_id
                        st.session_state.step = 2
                        status.update(label="✅ 전송 완료!", state="complete")
                        st.rerun()
                    except Exception as e: handle_api_error(e)

    # ==========================
    # STEP 2: 완료
    # ==========================
    elif st.session_state.step == 2:
        st.balloons()
        page_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        st.success("🎉 분석 리포트가 노션에 저장되었습니다!")
        st.markdown(f"""
        <div style="padding: 20px; border-radius: 10px; background-color: #e8f5e9; text-align: center; margin-bottom: 20px;">
            <a href="{page_url}" target="_blank" style="font-size: 1.5em; text-decoration: none; color: #2e7d32; font-weight: bold;">
                👉 최종 노션 리포트 열기
            </a>
        </div>
        """, unsafe_allow_html=True)
        if st.button("🔄 새로운 게임 탈곡하기", use_container_width=True):
            for key in list(st.session_state.keys()): del st.session_state[key]
            st.rerun()

if __name__ == "__main__":
    main()
