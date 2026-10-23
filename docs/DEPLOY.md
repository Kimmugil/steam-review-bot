# 배포 안내 (v2 가지 → 확인 → main)

기존 GitHub 저장소(`Kimmugil/steam-review-bot`)와 Vercel 프로젝트(`steam-thresher`)를 그대로 씁니다.
먼저 `v2` 가지로 올려 Vercel 미리보기에서 확인하고, 문제없으면 main 에 합칩니다.

## 0. 이미 준비된 것
- Supabase 에 `thresher` 구역과 전용 계정 `thresher_app` 이 만들어져 있고, 예전 리포트 20건(리뷰 원문 14,234건 포함)이 옮겨져 있습니다.
- 접속 주소는 내 컴퓨터의 `.env.local` 에만 있습니다. (GitHub 에 올라가지 않습니다)

## 1. 올리기
```bash
git -C "D:\JJ\steam-thresher-v2" push -u origin v2
```

## 2. 비밀값 넣기
값은 모두 **직접 붙여넣어** 주세요. 채팅이나 문서에 적지 마세요.

### 2-1. GitHub Secrets (저장소 → Settings → Secrets and variables → Actions)
| 이름 | 값 |
|---|---|
| `DATABASE_URL` | `.env.local` 의 `DATABASE_URL=` 뒤 전체 (**포트 5432, 세션 풀러**) |
| `GEMINI_API_KEY` | 기존 값 그대로 |

> ⚠ **세션 풀러(5432)** 주소를 쓰세요. 트랜잭션 풀러(6543)는 질의가 몰리면 연결이 멈추는 현상이 있어 쓰지 않습니다.
> 예전 시트용 Secrets(`GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_MASTER_ID` 등)은 안정된 뒤 지워도 됩니다.

### 2-2. Vercel (프로젝트 → Settings → Environment Variables)
| 이름 | 값 | 환경 |
|---|---|---|
| `DATABASE_URL` | 위와 같은 5432 주소 | Production, Preview |
| `GEMINI_API_KEY` | 기존 값 | Production, Preview |
| `ADMIN_PASSWORD_HASH` | `npm run hash-password` 로 만든 한 줄 | Production, Preview |
| `SESSION_SECRET` | 같은 명령이 함께 출력하는 긴 문자열 | Production, Preview |
| `GITHUB_PAT` | 기존 토큰 그대로 (이 저장소의 Actions 실행 권한 필요) | Production, Preview |
| `GITHUB_REF_NAME` | `v2` | **Preview 만** (v2 가지에서 시험할 때 분석 실행기 파일을 v2 에서 찾도록) |

예전 `GOOGLE_*`, `NOTION_*` 등은 지워도 됩니다.

## 3. 미리보기에서 확인할 것
1. 홈에 예전 리포트 카드(16개 게임)가 보이고 "예전 방식" 표시가 붙어 있는지
2. 게임 이름 검색 → 요청 → 진행 화면 → 완료 리포트까지 되는지 (1~3분)
3. 이미 분석된 게임을 다시 요청하면 "그 리포트 볼래요 / 새로 분석할래요"가 뜨는지
4. `/admin` 로그인, 하루 한도 바꾸기, 숨기기·삭제
5. `/api/health` 가 `db.ok: true`, 환경변수 모두 true 인지

> 미리보기와 운영은 같은 DB 를 씁니다. 시험으로 요청한 분석도 실제 목록에 남고 하루 한도를 씁니다. 시험 후 관리자 화면에서 지우세요.

## 4. main 에 합치기
확인이 끝나면 `v2` → `main` 으로 합칩니다. (GitHub 에서 Pull request 를 만들어 Merge 하면 됩니다.)
합친 뒤 Vercel 이 자동으로 운영 배포를 하고, 이후에는 `GITHUB_REF_NAME` 이 필요 없습니다.

## 5. 문제가 생기면
- 화면이 비거나 오류: `/api/health` 로 환경변수와 DB 연결을 확인
- 분석이 "대기"에서 안 넘어감: GitHub Actions 탭에서 `리뷰 분석 실행` 이 시작됐는지 확인. 30분 넘게 멈추면 자동으로 실패 처리되고 한도가 돌아옵니다.
- 분석 실패 이유는 진행 화면과 관리자 목록에 그대로 적힙니다.
