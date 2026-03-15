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

# CSS를 사용하여 상단 배너 고정
if ENV_NAME == "DEV":
    st.markdown("""
        <style>
            .fixed-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background-color: #ff4b4b;
                color: white;
                text-align: center;
                padding: 10px;
                font-weight: bold;
                z-index: 9999;
            }
            .main .block-container {
                margin-top: 40px; 
            }
        </style>
        <div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 마음껏 만지세요! 🚧</div>
    """, unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 Secrets 설정이 필요합니다.")
    st.stop()

def extract_id(s):
    # 주소에 섞인 보이지 않는 문자나 공백을 먼저 제거
    clean_s = s.strip()
    m = re.search(r'app/(\d+)', clean_s)
    return m.group(1) if m else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    st.progress(int((current_step + 1) * 33.3))
    steps = ["정보 입력", "웹 프리뷰 및 검수", "최종 완료"]
    cols = st.columns(3)
    for i, col in enumerate(cols):
        if i < current_step: col.markdown(f"<div style='text-align: center; color: gray;'>✅ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        elif i == current_step: col.markdown(f"<div style='text-align: center; font-weight: bold; color: #ff4b4b;'>🚀 Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
        else: col.markdown(f"<div style='text-align: center; color: lightgray;'>⚪ Step {i+1}. {steps[i]}</div>", unsafe_allow_html=True)
    st.write("")

def handle_api_error(e):
    error_str = str(e)
    if "429" in error_str:
        st.error("🚨 **[429 Client Error]**\n\nAI 사용량 한계에 도달했습니다. 잠시 후(1~2분) 다시 시도해 주세요!")
    elif "JSON_DECODE_ERROR" in error_str:
        st.error("🚨 **[분석 결과 형식 오류]**\n\nAI가 결과를 정리하다가 실수를 했네요(쉼표 누락 등). \n'데이터 탈곡 시작' 버튼을 눌러 다시 한번 시도해 주세요!")
    else:
        st.error(f"🚨 일시적인 에러 발생: {error_str.replace(GEMINI_API_KEY, '********') if GEMINI_API_KEY else error_str}\n\n잠시 후 다시 시도해 주세요.")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: st.caption("아직 분석한 게임이 없습니다.")
        else:
            for h in reversed(st.session_state.history[-5:]):
                st.markdown(f"- **{h['name']}**")
        st.divider()
        st.caption(f"Version: {APP_VERSION}")
        with st.expander("🛠️ 업데이트 이력"): st.markdown(UPDATE_HISTORY)

    col1, col2 = st.columns([3, 1])
    with col1:
        st.title("🚜 스팀 사용자 평가 탈곡기")
        st.markdown("스팀 상점 주소나 App ID를 입력하여 글로벌 여론을 탈탈 털어보세요.")
    with col2:
        st.write("")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLISH_URL, use_container_width=True)
    
    st.write("")
    render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader("🎮 Step 1. 분석할 게임 정보 입력")
            raw_input = st.text_input("👉 스팀 상점 URL 또는 App ID를 입력하세요", placeholder="[https://store.steampowered.com/app/2582960/](https://store.steampowered.com/app/2582960/)... 또는 2582960", label_visibility="collapsed")
            
            with st.expander("❓ 스팀 App ID가 뭔가요? (찾는 방법)"):
                st.markdown("1. 브라우저 주소창의 URL을 확인합니다. (예: `.../app/123450/`)")
                st.markdown("2. `/app/` 다음에 나오는 **숫자(123450)**가 App ID입니다!")

            if st.button("🚀 데이터 탈곡 시작", use_container_width=True, type="primary"):
                app_id = extract_id(raw_input)
                if not app_id: st.warning("ID를 확인해주세요."); return
                
                with st.status("데이터를 수집하고 분석하는 중... 🌾", expanded=True) as status:
                    try:
                        p = st.progress(0); txt = st.empty()
                        txt.write("🔍 1/5: 게임 정보 확인 중...")
                        rid, name, rdate = get_steam_game_info(app_id)
                        if not rid:
                            status.update(label="검색 실패", state="error")
                            st.error("게임 정보를 찾을 수 없습니다. 주소를 다시 확인해줘!"); return
                        p.progress(20)
                        
                        txt.write("📥 2/5 & 3/5: 최신 뉴스 및 리뷰 수집 중...")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday)
                        
                        if stats['all_total'] == 0: 
                            status.update(label="분석 불가", state="error")
                            st.error(f"⚠️ [{name}] 게임은 아직 작성된 리뷰가 없습니다!")
                            return
                        p.progress(50)
                        
                        txt.write("🧠 4/5: AI 다차원 분석 중 (전광판 가동)...")
                        ticker = st.empty()
                        res_box, event = [None, None], threading.Event()
                        def run():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as e: res_box[1] = str(e)
                            finally: event.set()
                        threading.Thread(target=run).start()
                        while not event.is_set():
                            ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}")
                            time.sleep(TICKER_INTERVAL)
                        
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({"app_id": rid, "game_name": name, "insights": res_box[0], "stats": stats, "recent_label": rlabel, "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r})
                        if not any(h['id'] == rid for h in st.session_state.history):
                            st.session_state.history.append({"id": rid, "name": name})

                        ticker.empty(); txt.write("✅ 5/5: 분석 완료!"); p.progress(100)
                        st.session_state.step = 1; status.update(label="✅ 분석 완료!", state="complete"); st.rerun()
                    except Exception as e: 
                        status.update(label="에러 발생", state="error")
                        handle_api_error(e)

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 분석 결과 미리보기")
        ins = st.session_state.insights
        stats = st.session_state.stats
        
        tab1, tab2, tab3 = st.tabs(["📊 종합 요약", "⏱️ 플레이타임 분석", "🌍 상세 분석 (이슈/뉴스/언어)"])
        with tab1:
            st.success(f"**💬 AI 한줄평:** {ins.get('critic_one_liner', '')}")
            col_s1, col_s2 = st.columns(2)
            with col_s1: st.metric("📈 전체 누적 평가", stats['all_desc'], delta=f"{stats['all_total']:,}개")
            with col_s2: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], delta=f"표본 {stats['recent_total']:,}개", delta_color="inverse")
            st.info(f"💡 **분석 근거:** {ins.get('sentiment_analysis', '')}")
            st.markdown("### 🎯 전 국가 망라 최종 요약")
            c_all, c_rec = st.columns(2)
            with c_all:
                st.markdown("##### 📈 전체 누적 주요 여론")
                for line in ins.get('final_summary_all', []): st.write(line)
            with c_rec:
                st.markdown(f"##### 🔥 {st.session_state.recent_label} 주요 여론")
                for line in ins.get('final_summary_recent', []): st.write(line)

        with tab2:
            st.markdown("### ⏱️ 플레이타임별 주요 민심 교차 분석")
            pt_data = ins.get('playtime_analysis', {})
            if pt_data:
                if pt_data.get('comparison_insights'): st.warning(f"**⚖️ 핵심 교차 체크포인트**\n\n" + "\n".join([f"- {i}" for i in pt_data.get('comparison_insights', [])]))
                p_col1, p_col2 = st.columns(2)
                with p_col1:
                    st.markdown(f"**{pt_data.get('newbie_title', '🌱 뉴비 여론')}**")
                    for line in pt_data.get('newbie_summary', []): st.write(f"- {line}")
                with p_col2:
                    st.markdown(f"**{pt_data.get('core_title', '💀 코어 유저 여론')}**")
                    for line in pt_data.get('core_summary', []): st.write(f"- {line}")

        with tab3:
            i_col1, i_col2 = st.columns(2)
            with i_col1:
                st.markdown("### 🚨 AI 이슈 픽")
                for line in ins.get('ai_issue_pick', []): st.write(f"📍 {line}")
            with i_col2:
                st.markdown("### 📢 최신 공지/업데이트 요약")
                if st.session_state.news_data and st.session_state.news_data[0]:
                    st.caption(f"🔗 [{st.session_state.news_data[3]}] {st.session_state.news_data[0]}")
                    for line in ins.get('news_summary', []): st.write(f"• {line}")
                else: st.write("관련 소식이 없습니다.")
            st.divider()
            st.markdown("### 📁 카테고리별 종합 평가")
            for cat in ins.get('global_category_summary', []):
                st.markdown(f"**{cat.get('category')}**")
                for line in cat.get('summary', []): st.write(f"  - {line}")
            st.divider()
            st.markdown("### 🌐 전 세계 누적 리뷰 언어 비중")
            sorted_langs = sorted(stats['total_lang_counts'].items(), key=lambda x: x[1], reverse=True)[:10]
            lang_df = pd.DataFrame([{"순위": f"{i+1}위", "언어": get_lang_name(l[0]), "리뷰 수": f"{l[1]:,}개", "비중": f"{(l[1]/stats['all_total'])*100:.1f}%"} for i, l in enumerate(sorted_langs)])
            st.table(lang_df)
            st.divider()
            st.markdown("### 🌍 리뷰 작성 언어별 세부 평가")
            for country in ins.get('country_analysis', []):
                st.markdown(f"**🚩 {country.get('language')}**")
                for c_cat in country.get('categories', []):
                    st.markdown(f"- **{c_cat.get('name')}**")
                    for summary_line in c_cat.get('summary', []): st.write(f"  - {summary_line}")

        st.divider()
        with st.container(border=True):
            st.markdown("### 📝 리포트 검수 및 전송")
            feedback = st.text_area("수정이 필요한가요? 피드백을 적어주세요.", placeholder="예: 뉴비들 의견을 더 자세하게 써줘", label_visibility="collapsed")
            c1, c2 = st.columns(2)
            with c1:
                if st.button("🔄 피드백 반영하여 재분석", use_container_width=True):
                    if not feedback.strip(): st.error("피드백을 입력해줘."); return
                    with st.status("재분석 중...", expanded=True) as status:
                        try:
                            res, err = analyze_with_gemini(st.session_state.game_name, st.session_state.reviews_all, st.session_state.reviews_recent, st.session_state.stats, st.session_state.recent_label, st.session_state.news_data, feedback)
                            if err: raise Exception(err)
                            st.session_state.insights = res; st.rerun()
                        except Exception as e: handle_api_error(e)
            with c2:
                if st.button("📤 노션으로 최종 리포트 전송", type="primary", use_container_width=True):
                    with st.status("노션 전송 중...", expanded=True) as status:
                        try:
                            pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data)
                            st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()
                        except Exception as e: handle_api_error(e)

    elif st.session_state.step == 2:
        st.balloons(); page_url = f"[https://notion.so/](https://notion.so/){st.session_state.page_id.replace('-', '')}"
        st.success("🎉 분석 리포트가 노션에 안전하게 저장되었습니다!")
        st.markdown(f'<div style="padding:20px;border-radius:10px;background-color:#e8f5e9;text-align:center;margin-bottom:20px;"><a href="{page_url}" target="_blank" style="font-size:1.5em;text-decoration:none;color:#2e7d32;font-weight:bold;">👉 최종 노션 리포트 열기</a></div>', unsafe_allow_html=True)
        if st.button("🔄 새로운 게임 탈곡하기", use_container_width=True):
            keys_to_delete = [k for k in st.session_state.keys() if k != 'history']
            for k in keys_to_delete: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
