import streamlit as st
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, NOTION_PUBLISH_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from messages import WAITING_MESSAGES
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini
from notion_exporter import upload_to_notion

st.set_page_config(page_title="스팀 사용자 평가 탈곡기", page_icon="🚜", layout="wide")

# CSS 주입: UI 디테일 개선
st.markdown("""
    <style>
        /* 상단 배너 고정 */
        .fixed-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background-color: #ff4b4b;
            color: white;
            text-align: center;
            padding: 8px;
            font-weight: bold;
            z-index: 9999;
        }
        /* 메인 컨테이너 마진 */
        .main .block-container {
            padding-top: 50px; 
        }
        /* 카드 스타일 컨테이너 */
        .stats-card {
            background-color: #1e2129;
            padding: 20px;
            border-radius: 12px;
            border-left: 5px solid #ff4b4b;
            margin-bottom: 15px;
        }
        .sentiment-card {
            background-color: #161b22;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #30363d;
        }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV":
    st.markdown('<div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 마음껏 만지세요! 🚧</div>', unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 Secrets 설정이 필요합니다. 배포 설정을 확인해줘.")
    st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    # 진행률 바와 함께 시각적 가독성 개선
    progress_val = int((current_step + 1) * 33.3)
    st.progress(progress_val)
    
    cols = st.columns(3)
    steps = ["1️⃣ 정보 입력", "2️⃣ 웹 프리뷰/검수", "3️⃣ 전송 완료"]
    for i, col in enumerate(cols):
        is_current = (i == current_step)
        color = "#ff4b4b" if is_current else ("#888" if i < current_step else "#444")
        weight = "bold" if is_current else "normal"
        col.markdown(f"<div style='text-align: center; color: {color}; font-weight: {weight};'> {steps[i]} </div>", unsafe_allow_html=True)
    st.write("")

def handle_api_error(e):
    error_str = str(e)
    if "429" in error_str:
        st.error("🚨 **[429 Client Error]**\\n\\nAI 사용량 한계다 ㅋㅋ 1~2분 뒤에 다시 해봐.")
    elif "JSON_DECODE_ERROR" in error_str:
        st.error("🚨 **[파싱 오류]**\\n\\nAI가 대답하다 찐빠를 냈어. 다시 시도해봐.")
    else:
        st.error(f"🚨 에러 발생: {error_str.replace(GEMINI_API_KEY, '********') if GEMINI_API_KEY else error_str}")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: st.caption("아직 기록이 없어 ㅋㅋ")
        else:
            for h in reversed(st.session_state.history[-5:]):
                st.markdown(f"- **{h['name']}**")
        st.divider()
        st.caption(f"Version: {APP_VERSION}")
        with st.expander("🛠️ 업데이트 이력"): st.markdown(UPDATE_HISTORY)

    # 헤더 섹션
    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title("🚜 스팀 사용자 평가 탈곡기")
        st.markdown("스팀 상점 주소나 App ID를 입력하여 글로벌 여론을 탈탈 털어보세요.")
    with col_h2:
        st.write("")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLISH_URL, use_container_width=True)
    
    st.write("")
    render_step_indicator(st.session_state.step)

    # Step 0: 정보 입력
    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader("🎮 Step 1. 분석할 게임 정보 입력")
            raw_input = st.text_input("스팀 URL 또는 ID 입력", placeholder="https://store.steampowered.com/app/2215430/...", label_visibility="collapsed")
            
            with st.expander("❓ 스팀 App ID가 뭔가요? (찾는 방법)"):
                st.markdown("1. 브라우저 주소창의 URL을 확인한다. (예: `.../app/123450/`)\\n2. `/app/` 다음에 나오는 **숫자**가 App ID야 ㅋㅋ")

            if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
                app_id = extract_id(raw_input)
                if not app_id: st.warning("ID 똑바로 입력해줘 ㅋㅋ"); return
                
                with st.status("데이터 탈곡 중... 🌾", expanded=True) as status:
                    try:
                        p_bar = st.progress(0); info_txt = st.empty()
                        
                        info_txt.write("🔍 1/5: 게임 정보 확인 중...")
                        rid, name, rdate = get_steam_game_info(app_id)
                        if not rid:
                            status.update(label="검색 실패", state="error")
                            st.error("게임 정보를 못 찾겠어. 주소 다시 확인해봐 ㅋㅋ"); return
                        p_bar.progress(20)
                        
                        info_txt.write("📥 2/5 & 3/5: 최신 뉴스 및 리뷰 수집 중...")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday)
                        
                        if stats['all_total'] == 0: 
                            status.update(label="리뷰 없음", state="error")
                            st.error(f"⚠️ [{name}] 리뷰가 하나도 없어서 분석 못 해 ㅋㅋ")
                            return
                        p_bar.progress(50)
                        
                        info_txt.write("🧠 4/5: AI 다차원 분석 중 (전광판 가동)...")
                        ticker = st.empty()
                        res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        while not event.is_set():
                            ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}")
                            time.sleep(TICKER_INTERVAL)
                        
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({"app_id": rid, "game_name": name, "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r})
                        if not any(h['id'] == rid for h in st.session_state.history):
                            st.session_state.history.append({"id": rid, "name": name})

                        ticker.empty(); info_txt.write("✅ 5/5: 분석 완료!"); p_bar.progress(100)
                        st.session_state.step = 1; status.update(label="✅ 탈곡 완료!", state="complete"); st.rerun()
                    except Exception as e: 
                        status.update(label="에러 발생", state="error")
                        handle_api_error(e)

    # Step 1: 웹 프리뷰 및 검수
    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 분석 결과 검수")
        ins = st.session_state.insights
        stats = st.session_state.stats
        
        # 탭 UI 적용
        t1, t2, t3 = st.tabs(["📊 요약 리포트", "⏱️ 플레이타임별 분석", "🌐 언어 및 카테고리"])
        
        with t1:
            st.markdown(f'<div class="stats-card"><b>💬 AI 한줄평:</b><br>{ins.get("critic_one_liner", "")}</div>', unsafe_allow_html=True)
            col_m1, col_m2 = st.columns(2)
            with col_m1: st.metric("📈 전체 누적", stats['all_desc'], f"{stats['all_total']:,}개")
            with col_s2: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], f"{stats['recent_total']:,}개")
            
            st.info(f"💡 **분석 근거:** {ins.get('sentiment_analysis', '')}")
            st.markdown("---")
            c_all, c_rec = st.columns(2)
            with c_all:
                st.markdown("##### 📈 전체 주요 여론")
                for line in ins.get('final_summary_all', []): st.write(line)
            with c_rec:
                st.markdown(f"##### 🔥 {st.session_state.recent_label} 주요 여론")
                for line in ins.get('final_summary_recent', []): st.write(line)

        with t2:
            st.markdown("### ⏱️ 플레이타임별 민심 교차 분석")
            pt = ins.get('playtime_analysis', {})
            if pt:
                if pt.get('comparison_insights'):
                    st.warning(f"**⚖️ 핵심 교차 인사이트**\\n\\n" + "\\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
                p_c1, p_c2 = st.columns(2)
                with p_c1:
                    st.markdown(f"**{pt.get('newbie_title', '🌱 뉴비')}**")
                    for l in pt.get('newbie_summary', []): st.write(f"- {l}")
                with p_c2:
                    st.markdown(f"**{pt.get('core_title', '💀 코어 유저')}**")
                    for l in pt.get('core_summary', []): st.write(f"- {l}")

        with t3:
            st.markdown("### 🚨 AI 이슈 픽 & 📢 소식")
            i_c1, i_c2 = st.columns(2)
            with i_c1:
                for line in ins.get('ai_issue_pick', []): st.write(f"📍 {line}")
            with i_c2:
                if st.session_state.news_data and st.session_state.news_data[0]:
                    st.caption(f"🔗 {st.session_state.news_data[0]}")
                    for line in ins.get('news_summary', []): st.write(f"• {line}")
            
            st.divider()
            st.markdown("### 📁 카테고리별 평가")
            for cat in ins.get('global_category_summary', []):
                with st.expander(f"📌 {cat.get('category')}"):
                    for line in cat.get('summary', []): st.write(f"- {line}")
            
            st.divider()
            st.markdown("### 🚩 언어별 세부 리포트")
            for country in ins.get('country_analysis', []):
                st.markdown(f"**[{country.get('language')}]**")
                for c_cat in country.get('categories', []):
                    st.write(f"  - {c_cat.get('name')}: {', '.join(c_cat.get('summary', []))}")

        st.divider()
        with st.container(border=True):
            st.markdown("### 📝 최종 검수")
            fb = st.text_area("수정 피드백 (필요 시)", placeholder="예: 언어별 비중 표도 같이 넣어줘 ㅋㅋ", label_visibility="collapsed")
            b_c1, b_c2 = st.columns(2)
            with b_c1:
                if st.button("🔄 피드백 반영 재분석", use_container_width=True):
                    with st.status("재분석 중...", expanded=True):
                        res, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.stats, st.session_state.recent_label, st.session_state.news_data, fb)
                        if err: handle_api_error(err); return
                        st.session_state.insights = res; st.rerun()
            with b_c2:
                if st.button("📤 노션 리포트 최종 전송", type="primary", use_container_width=True):
                    with st.status("노션 전송 중..."):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                        st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    # Step 2: 전송 완료
    elif st.session_state.step == 2:
        st.balloons()
        st.success("🎉 탈곡 완료! 노션에 리포트 꽂아놨어 ㅋㅋ")
        p_url = f"https://notion.so/{st.session_state.page_id.replace('-', '')}"
        st.markdown(f'<div style="padding:30px; border-radius:15px; background-color:#1e2129; text-align:center;"><a href="{p_url}" target="_blank" style="font-size:1.5em; color:#ff4b4b; font-weight:bold; text-decoration:none;">🔗 완성된 노션 리포트 열기</a></div>', unsafe_allow_html=True)
        if st.button("🔄 다른 게임 탈곡하기", use_container_width=True):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
