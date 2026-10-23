/** 화면 문구 목록. 관리자 화면에서 고칠 수 있고, 고치지 않은 문구는 여기 기본값을 씁니다. */
export type Texts = Record<string, string>;
export interface TextDef { key: string; group: string; label: string; def: string; where: string }

export const TEXT_DEFS: TextDef[] = [
  { key: "site_title", group: "공통", label: "사이트 이름", def: "스팀 리뷰 탈곡기", where: "맨 위 왼쪽 로고 옆, 브라우저 탭" },
  { key: "foot", group: "공통", label: "맨 아래 안내", def: "숫자는 스팀에서 받아 코드가 계산하고, AI는 리뷰 표본을 읽고 해석만 합니다. 자세한 방법은 '분석 방법'에서 볼 수 있어요.", where: "모든 화면 맨 아래" },

  { key: "home_title", group: "홈", label: "첫 화면 제목", def: "스팀 리뷰, 탈탈 털어 드립니다", where: "홈 맨 위 큰 제목" },
  { key: "home_desc", group: "홈", label: "첫 화면 설명", def: "게임 이름이나 스팀 상점 주소를 넣으면, 유저 리뷰를 언어별로 나눠 평가와 이유를 정리해 드려요. 숫자는 스팀에서 정확히 가져오고, AI는 리뷰를 읽고 해석만 합니다.", where: "홈 제목 아래 설명" },
  { key: "home_placeholder", group: "홈", label: "입력칸 안내", def: "게임 이름, 스팀 상점 주소, App ID", where: "분석 요청 입력칸" },
  { key: "home_btn", group: "홈", label: "분석 버튼", def: "분석 요청", where: "입력칸 옆 버튼" },
  { key: "home_quota", group: "홈", label: "남은 횟수 문구", def: "오늘 남은 분석 횟수", where: "버튼 아래 작은 글씨 (한국 시간 자정에 초기화)" },
  { key: "home_progress_title", group: "홈", label: "진행 중 제목", def: "지금 분석 중", where: "진행 중인 분석 목록 위" },
  { key: "home_recent_title", group: "홈", label: "완료 목록 제목", def: "분석이 끝난 리포트", where: "카드 목록 위" },
  { key: "home_empty", group: "홈", label: "리포트가 없을 때", def: "아직 분석된 게임이 없어요. 위에서 첫 분석을 요청해 보세요.", where: "카드 목록이 비었을 때" },

  { key: "dlg_exists_title", group: "요청 안내", label: "이미 분석된 게임 제목", def: "이미 분석된 리포트가 있어요", where: "같은 게임 분석이 있을 때 뜨는 창" },
  { key: "dlg_exists_body", group: "요청 안내", label: "이미 분석된 게임 설명", def: "{date}에 분석한 리포트가 있어요. 먼저 확인해 보시겠어요? 최신 리뷰로 다시 분석하면 오늘 분석 횟수가 1회 쓰여요.", where: "같은 창의 설명 ({date}는 분석 날짜로 바뀜)" },
  { key: "dlg_exists_view", group: "요청 안내", label: "리포트 보기 버튼", def: "그 리포트 볼래요", where: "같은 창 버튼" },
  { key: "dlg_exists_new", group: "요청 안내", label: "새로 분석 버튼", def: "아니요, 새로 분석할래요", where: "같은 창 버튼" },
  { key: "dlg_active_title", group: "요청 안내", label: "분석 중 제목", def: "지금 이 게임을 분석 중이에요", where: "같은 게임이 진행 중일 때 뜨는 창" },
  { key: "dlg_active_body", group: "요청 안내", label: "분석 중 설명", def: "{time}에 시작한 분석이 진행 중이에요. 보통 1~3분 걸려요. 진행 화면에서 기다리면 끝나는 대로 결과가 나와요.", where: "같은 창의 설명 ({time}은 시작 시각)" },
  { key: "dlg_active_view", group: "요청 안내", label: "진행 보기 버튼", def: "진행 상황 보기", where: "같은 창 버튼" },
  { key: "dlg_limit", group: "요청 안내", label: "한도 초과 안내", def: "오늘 분석할 수 있는 횟수를 모두 썼어요. 한국 시간 자정에 다시 열려요. 이미 분석된 리포트는 언제든 볼 수 있어요.", where: "하루 한도를 넘었을 때" },

  { key: "lang_notice", group: "리포트", label: "언어 기준 안내", def: "이 분석은 국가가 아니라 리뷰를 쓴 '언어' 기준이에요. 영어 리뷰가 미국 유저의 의견은 아니에요. 같은 언어를 쓰는 사람이 여러 나라에 흩어져 있기 때문이에요.", where: "리포트의 '언어별' 화면 맨 위" },
  { key: "ai_notice", group: "리포트", label: "AI 역할 안내", def: "숫자는 코드가 스팀에서 받아 계산했고, AI는 무작위로 뽑은 리뷰 표본을 읽고 해석했어요. 비중은 '표본 안에서의 비중'이며 전체 유저의 비중이 아니에요.", where: "리포트의 AI 해석 영역 위" },
  { key: "legacy_notice", group: "리포트", label: "예전 방식 안내", def: "이 리포트는 예전 방식(2026년 8월 이전)으로 만들었어요. 숫자 기준과 리뷰를 고르는 방식이 지금과 달라서, 새 리포트와 직접 비교하지는 마세요.", where: "예전 리포트 맨 위" },
];

export const TEXT_GROUPS = [...new Set(TEXT_DEFS.map((t) => t.group))];
