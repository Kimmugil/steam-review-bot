import streamlit as st
import random
import time
import threading
import re
import pandas as pd
from config import APP_VERSION, NOTION_PUBLIC_URL, GEMINI_API_KEY, NOTION_TOKEN, TICKER_INTERVAL, ENV_NAME
from updates import UPDATE_HISTORY
from messages import WAITING_MESSAGES
from steam_api import get_steam_game_info, fetch_latest_news, get_smart_period, fetch_steam_reviews, get_lang_name
from ai_analyzer import analyze_with_gemini, ask_followup_question
from notion_exporter import upload_to_notion

st.set_page_config(page_title="스팀 리뷰 탈곡기", page_icon="🚜", layout="wide")

def render_colored_text(text):
    if "[긍정]" in text: return f":blue[{text}]"
    elif "[부정]" in text: return f":red[{text}]"
    return text

# 💡 [업데이트 7번] 토스(Toss) 스타일 UI/UX CSS 주입 (다크/라이트 호환, 노란색 포인트)
st.markdown("""
    <style>
        .fixed-banner { position: fixed; top: 0; left: 0; width: 100%; background-color: #F04452; color: white; text-align: center; padding: 8px; font-weight: bold; z-index: 9999; }
        .main .block-container { padding-top: 50px; font-family: 'Pretendard', sans-serif; }
        
        /* 토스 스타일 카드 UI */
        .toss-card { 
            background-color: rgba(128, 128, 128, 0.08); 
            padding: 24px; 
            border-radius: 16px; 
            margin-bottom: 16px; 
        }
        
        /* 토스 스타일 Primary 버튼 (황금빛 노란색 + 검정 텍스트) */
        button[kind="primary"] {
            background-color: #FFC000 !important;
            color: #111111 !important;
            border: none !important;
            font-weight: 700 !important;
            border-radius: 12px !important;
            padding: 10px 24px !important;
        }
        button[kind="primary"]:hover {
            background-color: #E5AC00 !important;
        }
    </style>
""", unsafe_allow_html=True)

if ENV_NAME == "DEV": st.markdown('<div class="fixed-banner">🚧 개발 환경 (DEV MODE) - 테스트 데이터를 자유롭게 활용하세요.</div>', unsafe_allow_html=True)

if not GEMINI_API_KEY or not NOTION_TOKEN:
    st.error("🚨 API 키 설정이 누락되었습니다.")
    st.stop()

def extract_id(s):
    if not s: return None
    clean_s = s.strip()
    match = re.search(r'app/(\d+)', clean_s)
    return match.group(1) if match else (clean_s if clean_s.isdigit() else None)

def render_step_indicator(current_step):
    progress_val = int((current_step + 1) * 33.3)
    st.progress(progress_val)
    cols = st.columns(3)
    steps = ["1️⃣ 분석 대상 입력", "2️⃣ 리포트 검수", "3️⃣ 발행 완료"]
    for i, col in enumerate(cols):
        color = "#FFC000" if i == current_step else ("#888" if i < current_step else "#444")
        weight = "bold" if i == current_step else "normal"
        col.markdown(f"<div style='text-align: center; color: {color}; font-weight: {weight};'> {steps[i]} </div>", unsafe_allow_html=True)
    st.write("")

def main():
    if "history" not in st.session_state: st.session_state.history = []
    if "step" not in st.session_state:
        st.session_state.step = 0
        st.session_state.update({"app_id": None, "game_name": None, "insights": None, "qa_history": []})

    with st.sidebar:
        st.markdown(f"### 📍 환경: `{ENV_NAME}`")
        st.divider()
        st.markdown("### 📚 최근 분석 기록")
        if not st.session_state.history: 
            st.caption("기록된 이력이 없습니다.")
        else:
            st.caption("👇 게임명을 클릭하면 과거 분석을 다시 볼 수 있습니다.")
            for idx, h in enumerate(reversed(st.session_state.history[-5:])):
                if st.button(f"🎮 {h['game_name']}", key=f"hist_btn_{idx}_{h['app_id']}", use_container_width=True):
                    st.session_state.update({
                        "app_id": h['app_id'], "game_name": h['game_name'], "rel_date_str": h['rel_date_str'], 
                        "insights": h['insights'], "stats": h['stats'], "recent_label": h['recent_label'], 
                        "news_data": h['news_data'], "smart_reason": h['smart_reason'], 
                        "reviews_all": h['reviews_all'], "reviews_recent": h['reviews_recent'],
                        "qa_history": h.get('qa_history', [])
                    })
                    st.session_state.step = 1
                    st.rerun()
        st.divider()
        st.caption(f"Version: {APP_VERSION}")
        # 💡 [복구 10번] 업데이트 이력 다시 살려냄!
        with st.expander("🛠️ 업데이트 이력"): st.markdown(UPDATE_HISTORY)

    col_h1, col_h2 = st.columns([3, 1])
    with col_h1:
        st.title("🚜 스팀 리뷰 탈곡기")
        # 💡 [복구 10번] 설명 텍스트 살려냄!
        st.markdown("스팀 상점 주소나 App ID를 입력하여 글로벌 유저들의 진짜 민심을 탈탈 털어보세요.")
    with col_h2:
        st.write("")
        st.link_button("👉 통합 리포트 열람", NOTION_PUBLIC_URL, use_container_width=True)
    
    st.write("")
    render_step_indicator(st.session_state.step)

    if st.session_state.step == 0:
        with st.container(border=True):
            st.subheader("🎮 Step 1. 분석할 게임 찾기")
            
            # 💡 [업데이트 9번] 입력창 하단 설명(가이드) 고정 배치
            raw_input = st.text_input("스팀 URL 또는 App ID 입력", placeholder="예: https://store.steampowered.com/app/2215430", label_visibility="collapsed")
            st.caption("ℹ️ 스팀 상점 페이지의 주소(URL) 전체를 복사해서 붙여넣거나, 주소에 포함된 숫자(App ID)만 입력하셔도 됩니다.")
            
            app_id = extract_id(raw_input)
            game_candidate_name = None
            
            # 💡 [업데이트 12번] 입력 시 바로 <OOO> 리뷰를 탈곡할까요? 띄워주기
            if app_id:
                rid, game_candidate_name, rdate = get_steam_game_info(app_id)
            
            if game_candidate_name:
                st.markdown(f"#### 🌾 **{game_candidate_name}** 리뷰를 탈곡할까요?")
                btn_text = "🚀 리뷰 탈곡하기"
            else:
                btn_text = "🚀 리뷰 탈곡하기"

            if st.button(btn_text, use_container_width=True, type="primary"):
                if not app_id: st.warning("유효한 App ID 또는 주소를 입력해 주세요."); return
                
                # 💡 [업데이트 12번] 상태 메시지 게임명 포함으로 변경
                target_name = game_candidate_name if game_candidate_name else "게임"
                with st.status(f"[{target_name}] 스팀 리뷰 탈곡 중... 🌾", expanded=True) as status:
                    try:
                        # 💡 [복구 10번] 프로그레스 바 및 전광판 텍스트 복구
                        p_bar = st.progress(0)
                        info_txt = st.empty()
                        
                        info_txt.write("🔍 1/5: 게임 기본 정보 확인 중...")
                        if not game_candidate_name:
                            rid, name, rdate = get_steam_game_info(app_id)
                        else:
                            name = game_candidate_name
                        if not rid: raise Exception("게임 정보 불러오기 실패")
                        p_bar.progress(20)
                        
                        info_txt.write("📥 2/5 & 3/5: 최신 소식 및 리뷰 데이터 수집 중...")
                        rday, rlabel, rreason = get_smart_period(rdate)
                        news = fetch_latest_news(rid)
                        all_r, rec_r, stats = fetch_steam_reviews(rid, rday, rdate)
                        if stats['all_total'] == 0: raise Exception("데이터 없음")
                        p_bar.progress(50)
                        
                        info_txt.write("🧠 4/5: AI 다차원 분석 진행 중...")
                        ticker = st.empty()
                        res_box, event = [None, None], threading.Event()
                        def run_ai():
                            try: res_box[0], res_box[1] = analyze_with_gemini(name, all_r, rec_r, stats, rlabel, news)
                            except Exception as ex: res_box[1] = str(ex)
                            finally: event.set()
                        threading.Thread(target=run_ai).start()
                        
                        # 💡 [복구 10번] 팁 메시지 깜빡거리는 전광판 복구
                        while not event.is_set(): 
                            ticker.info(f"💡 {random.choice(WAITING_MESSAGES)}")
                            time.sleep(TICKER_INTERVAL)
                        
                        if res_box[1]: raise Exception(res_box[1])
                        
                        st.session_state.update({
                            "app_id": rid, "game_name": name, "rel_date_str": rdate.strftime("%Y년 %m월 %d일"), 
                            "insights": res_box[0], "stats": stats, "recent_label": rlabel, 
                            "news_data": news, "smart_reason": rreason, "reviews_all": all_r, "reviews_recent": rec_r,
                            "qa_history": []
                        })
                        history_item = {k: st.session_state[k] for k in ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history"]}
                        st.session_state.history = [h for h in st.session_state.history if h['app_id'] != rid]
                        st.session_state.history.append(history_item)
                        
                        ticker.empty()
                        info_txt.write("✅ 5/5: 분석 완료!")
                        p_bar.progress(100)
                        st.session_state.step = 1
                        status.update(label="✅ 완료", state="complete")
                        st.rerun()
                    except Exception as e: 
                        status.update(label="에러", state="error")
                        st.error(str(e))

    elif st.session_state.step == 1:
        st.subheader(f"Step 2. [{st.session_state.game_name}] 리포트 검수")
        st.info("💡 발행 전 생성된 데이터를 검토하고, 추가 질문이 있다면 AI와 대화할 수 있습니다.")
        
        ins, stats = st.session_state.insights, st.session_state.stats
        tab1, tab2, tab3, tab4 = st.tabs(["📊 주요 요약", "⏱️ 플탐 분석", "🌐 권역 & 언어", "🙋‍♀️ AI 질문"])
        
        with tab1:
            st.markdown(f'<div class="toss-card"><b>💬 AI 한줄평:</b><br>{ins.get("critic_one_liner", "")}</div>', unsafe_allow_html=True)
            col1, col2, col3 = st.columns(3)
            with col1: st.metric("🛑 스팀 공식 평점", stats.get('official_desc', '평가 없음'))
            with col2: st.metric("📈 전체 누적 평점", stats['all_desc'], f"{stats['all_total']:,}개")
            with col3: st.metric(f"🔥 {st.session_state.recent_label}", stats['recent_desc'], f"{stats['recent_total']:,}개")
            
            st.markdown("##### 🎯 종합 여론 브리핑")
            st.info(ins.get('sentiment_analysis', ''))
            
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("**📈 누적 여론 동향**")
                for line in ins.get('final_summary_all', []): st.write(render_colored_text(line))
            with c2:
                st.markdown(f"**🔥 {st.session_state.recent_label} 동향**")
                for line in ins.get('final_summary_recent', []): st.write(render_colored_text(line))

        with tab2:
            st.markdown("### ⏱️ 플레이타임별 민심 교차 분석")
            pt = ins.get('playtime_analysis', {})
            if pt:
                if pt.get('comparison_insights'): 
                    st.warning("**⚖️ 핵심 인사이트**\n" + "\n".join([f"- {i}" for i in pt.get('comparison_insights', [])]))
                p1, p2, p3 = st.columns(3)
                with p1:
                    st.markdown(f"**{pt.get('newbie_title', '🌱 뉴비 (하위 25%)')}**")
                    st.caption(f"표본: {stats.get('newbie_total', 0)}개 | 여론: {stats.get('newbie_desc', '평가 없음')}")
                    for l in pt.get('newbie_summary', []): st.write(f"- {render_colored_text(l)}")
                with p2:
                    st.markdown(f"**{pt.get('normal_title', '🚶 일반 (중위 50%)')}**")
                    st.caption(f"표본: {stats.get('norm_total', 0)}개 | 여론: {stats.get('norm_desc', '평가 없음')}")
                    for l in pt.get('normal_summary', []): st.write(f"- {render_colored_text(l)}")
                with p3:
                    st.markdown(f"**{pt.get('core_title', '💀 코어 (상위 25%)')}**")
                    st.caption(f"표본: {stats.get('core_total', 0)}개 | 여론: {stats.get('core_desc', '평가 없음')}")
                    for l in pt.get('core_summary', []): st.write(f"- {render_colored_text(l)}")

        with tab3:
            st.markdown("### 🗺️ 권역별 세부 평가 분석")
            reg_data = ins.get('region_analysis', {})
            if reg_data.get('divergence_insight'):
                st.success(f"**💡 권역별 다이버전스 인사이트**\n\n{reg_data['divergence_insight']}")
            
            for reg in reg_data.get('regions', []):
                with st.expander(f"📍 {reg.get('region')} (동향: {reg.get('trend')})"):
                    st.caption(f"🔑 주요 키워드: {', '.join(reg.get('keywords', []))}")
                    for cat in reg.get('categories', []):
                        st.write(f"**{render_colored_text(cat.get('name'))}**: {' '.join(cat.get('summary', []))}")
            
            st.divider()
            st.markdown("### 🌍 글로벌 언어 및 권역 통계표")
            def apply_eval_color(val):
                val_str = str(val)
                if "긍정적" in val_str: return "color: #3182F6" # Toss Blue
                elif "부정적" in val_str: return "color: #F04452" # Toss Red
                return "color: #888888"

            df_cols_region = ["순위", "권역", "리뷰 수", "비중", "👍 긍정 비율", "👎 부정 비율", "📊 평가 결과"]
            df_region = pd.DataFrame([[r['rank'], r['region'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_region']], columns=df_cols_region)
            try: styled_region = df_region.style.map(apply_eval_color, subset=["📊 평가 결과"])
            except AttributeError: styled_region = df_region.style.applymap(apply_eval_color, subset=["📊 평가 결과"])
            
            st.markdown("##### 🗺️ 주요 권역별 누적 리뷰 비중")
            st.dataframe(styled_region, hide_index=True, use_container_width=True)

            # 💡 [복구 10번] 누락되었던 언어별 테이블 전체 복구!
            df_cols = ["순위", "언어", "리뷰 수", "비중", "👍 긍정 비율", "👎 부정 비율", "📊 평가 결과"]
            df_all = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_all']], columns=df_cols)
            df_30 = pd.DataFrame([[r['rank'], r['lang'], f"{r['count']:,}개", r['ratio'], r['pos_ratio'], r['neg_ratio'], r['eval']] for r in stats['table_data_30']], columns=df_cols)

            try:
                styled_all_top10 = df_all.head(10).style.map(apply_eval_color, subset=["📊 평가 결과"])
                styled_all_full = df_all.style.map(apply_eval_color, subset=["📊 평가 결과"])
                styled_30_top10 = df_30.head(10).style.map(apply_eval_color, subset=["📊 평가 결과"])
                styled_30_full = df_30.style.map(apply_eval_color, subset=["📊 평가 결과"])
            except AttributeError:
                styled_all_top10 = df_all.head(10).style.applymap(apply_eval_color, subset=["📊 평가 결과"])
                styled_all_full = df_all.style.applymap(apply_eval_color, subset=["📊 평가 결과"])
                styled_30_top10 = df_30.head(10).style.applymap(apply_eval_color, subset=["📊 평가 결과"])
                styled_30_full = df_30.style.applymap(apply_eval_color, subset=["📊 평가 결과"])

            st.markdown("##### 🥇 언어별 누적 리뷰 비중 TOP 10")
            st.dataframe(styled_all_top10, hide_index=True, use_container_width=True)
            with st.expander("👀 전 세계 누적 리뷰 언어별 비중 (전체 보기)"):
                st.dataframe(styled_all_full, hide_index=True, use_container_width=True)
                
            st.markdown("##### 🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10")
            if stats['days_since_release'] < 30:
                st.info("ℹ️ 출시일로부터 30일 이후부터 지원하는 표입니다.")
            else:
                st.dataframe(styled_30_top10, hide_index=True, use_container_width=True)
                with st.expander("👀 최근 30일 누적 리뷰 언어별 비중 (전체보기)"):
                    st.dataframe(styled_30_full, hide_index=True, use_container_width=True)

        with tab4:
            st.markdown("### 🙋‍♀️ AI에게 추가 질문하기")
            st.caption("현재 작성된 분석 리포트를 기반으로 궁금한 점을 물어보세요. 마음에 드는 답변은 리포트에 박제할 수 있습니다!")
            if st.session_state.qa_history:
                for qa in st.session_state.qa_history:
                    st.markdown(f"**Q. {qa['q']}**"); st.info(f"**A.** {qa['a']}")
            
            q_input = st.text_input("질문을 입력하세요:", placeholder="예: 그래픽이나 최적화 관련 부정적인 여론이 있어?")
            if st.button("💬 질문하기", type="primary"):
                if q_input:
                    with st.spinner("AI가 데이터를 다시 훑어보고 있습니다..."):
                        ans, err = ask_followup_question(st.session_state.game_name, st.session_state.stats, st.session_state.insights, q_input)
                        if not err: st.session_state.current_q, st.session_state.current_a = q_input, ans; st.rerun()
            
            if st.session_state.get('current_a'):
                st.markdown("---")
                st.markdown(f"**나의 질문:** {st.session_state.current_q}")
                st.success(f"**🤖 AI:** {st.session_state.current_a}")
                if st.button("✅ 리포트에 추가"):
                    st.session_state.qa_history.append({"q": st.session_state.current_q, "a": st.session_state.current_a})
                    for h in st.session_state.history:
                        if h['app_id'] == st.session_state.app_id: h['qa_history'] = st.session_state.qa_history
                    st.session_state.current_q, st.session_state.current_a = "", ""; st.rerun()

        st.divider()
        with st.container(border=True):
            st.markdown("### 📝 최종 발행 및 다음 스텝")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔄 노션 발행 없이 다른 게임 분석하기", use_container_width=True):
                    keys_to_clear = ["app_id", "game_name", "rel_date_str", "insights", "stats", "recent_label", "news_data", "smart_reason", "reviews_all", "reviews_recent", "qa_history"]
                    for k in keys_to_clear: st.session_state[k] = None
                    st.session_state.step = 0; st.rerun()
            with col2:
                if st.button("📤 노션 리포트 최종 발행", type="primary", use_container_width=True):
                    with st.status("노션으로 데이터를 쏘고 있습니다..."):
                        pid = upload_to_notion(st.session_state.app_id, st.session_state.game_name, st.session_state.rel_date_str, st.session_state.stats, ins, st.session_state.recent_label, st.session_state.smart_reason, st.session_state.news_data, st.session_state.qa_history)
                        st.session_state.page_id = pid; st.session_state.step = 2; st.rerun()

    elif st.session_state.step == 2:
        st.balloons()
        st.success("🎉 리포트 발행이 완료되었습니다!")
        st.markdown(f'<div class="toss-card" style="text-align:center;"><a href="https://notion.so/{st.session_state.page_id.replace("-", "")}" target="_blank" style="font-size:1.5em; color:#3182F6; font-weight:700; text-decoration:none;">🔗 생성된 노션 리포트 확인하기</a></div>', unsafe_allow_html=True)
        if st.button("🔄 다른 게임 분석하기", use_container_width=True, type="primary"):
            for k in [k for k in st.session_state.keys() if k != 'history']: del st.session_state[k]
            st.rerun()

if __name__ == "__main__": main()
