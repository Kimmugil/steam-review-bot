---
name: v3 Vercel 마이그레이션 아키텍처
description: 스팀 리뷰 탈곡기 v3 — Next.js/Vercel 마이그레이션 핵심 설계 결정
type: project
---

## 스택

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Deployment**: Vercel (Pro 권장 — analyze 엔드포인트 최대 300초 타임아웃 필요)
- **Database**: Google Sheets (`googleapis` npm 패키지, 서비스 계정 인증)
- **AI**: Gemini 2.5 Flash (기존 프롬프트 그대로 유지)
- **Notion**: `@notionhq/client` 대신 직접 REST API 호출

## Google Sheets 구조

**마스터 시트** (`GOOGLE_SHEETS_MASTER_ID` 환경변수):
- `ui_texts` 탭: key | value | 설명 — UI 텍스트 전부 여기서 관리
- `reports_index` 탭: 전체 분석 목록 (uuid, app_id, game_name, timestamps, 노션 발행 여부 등)

**게임별 시트** (Drive에서 자동 생성, 이름: `[{app_id}] {game_name}`):
- `분석 목록` 탭: 해당 게임의 분석 목록
- `data_{uuid_short}` 탭: 분석 전체 데이터 (store_stats, ai_data, news_data JSON)

## 분석 플로우

POST `/api/analyze` → SSE 스트리밍:
1. game_info → Steam 게임 정보
2. stats_start → 30개 언어 병렬 통계 수집
3. reviews_start → 리뷰 원문 수집 (Steam API)
4. ai_start → Gemini API 호출
5. saving → Google Sheets 저장
6. complete { uuid } → 클라이언트가 /report/{uuid}로 이동

## 환경변수

- `GEMINI_API_KEY`
- `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_PUBLIC_URL`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON 한줄로)
- `GOOGLE_SHEETS_MASTER_ID`
- `ENV_NAME`, `APP_VERSION`

## 레거시 Python

기존 Python 파일은 `_legacy/` 폴더에 보관.

**Why:** Vercel Pro 필요 이유: analyze API는 Steam 수집(20-40s) + Gemini(20-60s) = 최대 100s
