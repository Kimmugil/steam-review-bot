-- 스팀 리뷰 탈곡기 v2 — DB 구조 (구역 이름: thresher)
-- 같은 Supabase 프로젝트의 다른 서비스와 섞이지 않도록 전용 구역(스키마)과 전용 계정(thresher_app)을 씁니다.
-- 계정의 기본 경로가 thresher 이므로 코드에서는 표 이름만 쓰면 됩니다.

-- 게임 기본 정보 (검색·미리보기 캐시)
create table if not exists games (
  app_id        bigint primary key,
  name          text not null,
  header_image  text,
  release_date  date,
  updated_at    timestamptz not null default now()
);

-- 분석 한 건 = 한 줄. 요청부터 완료까지 상태가 여기서 바뀝니다(별도 대기열 표 없음).
create table if not exists analyses (
  id              uuid primary key default gen_random_uuid(),
  app_id          bigint not null,
  game_name       text not null,
  header_image    text,
  release_date    date,

  status          text not null default 'queued' check (status in ('queued','running','done','failed')),
  step            text,                       -- 진행 단계: game_info / stats / reviews / ai / saving
  error           text,                       -- 실패 사유 (숨기지 않고 화면에 보여 줌)
  method_version  smallint not null default 2, -- 1 = 예전 방식(구글 시트 시절), 2 = 이번 개편 방식
  hidden          boolean not null default false,
  requested_via   text not null default 'web' check (requested_via in ('web','admin','legacy')),
  requester_hash  text,                       -- 방문자 식별 해시(원본 IP는 저장 안 함)
  requested_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,

  -- 분석 기간
  period_days     int,
  period_start    date,
  period_end      date,
  recent_label    text,
  smart_reason    text,

  -- 목록·카드에 쓰는 요약 (상세 JSON을 열지 않고도 목록을 그릴 수 있게)
  all_desc        text,
  all_total       int,
  recent_desc     text,
  recent_total    int,
  one_liner       text,

  -- 상세: 숫자(코드가 계산) / AI 해석 / 소식
  stats           jsonb,
  ai              jsonb,
  news            jsonb
);
create index if not exists analyses_app_idx  on analyses (app_id, requested_at desc);
create index if not exists analyses_list_idx on analyses (requested_at desc) where status = 'done' and not hidden;
-- 같은 게임을 동시에 두 번 분석하지 않게: 진행 중(대기/실행)인 분석은 게임당 1건만
create unique index if not exists analyses_one_active_per_game on analyses (app_id) where status in ('queued','running');

-- 분석에 쓴 리뷰 표본(원문). 같은 리뷰가 분석마다 반복 저장되지 않도록 분석별로만 보관, 90일 지나면 정리 가능.
create table if not exists review_samples (
  id                bigserial primary key,
  analysis_id       uuid not null references analyses(id) on delete cascade,
  sample_no         int,                      -- 분석 안에서의 번호(R1, R2 …). AI가 가리킨 근거 번호와 연결
  kind              text not null,            -- recent(분석 기간 표본) / legacy_all / legacy_recent (예전 방식)
  language          text not null,
  voted_up          boolean not null,
  playtime_h        numeric(8,1),
  review            text not null,
  recommendation_id bigint
);
create index if not exists review_samples_analysis_idx on review_samples (analysis_id);
create index if not exists review_samples_no_idx on review_samples (analysis_id, sample_no);

-- 화면 문구 (관리자 화면에서 고칠 수 있음)
create table if not exists ui_texts (
  key          text primary key,
  value        text not null,
  description  text,
  updated_at   timestamptz not null default now()
);

-- 설정값 (하루 분석 한도 등). 비밀번호는 여기가 아니라 환경변수(해시)로만 둡니다.
create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('daily_limit', '30'),
  ('marquee_speed_per_card', '10'),
  ('ai_monthly_call_cap', '300')
on conflict (key) do nothing;

-- 하루 분석 요청 수 (한국 날짜 기준)
create table if not exists daily_usage (
  day    date primary key,
  count  int not null default 0
);

-- 한도 안이면 1칸을 '한 번에 안전하게' 가져옵니다(동시에 여러 명이 눌러도 한도를 넘지 않음).
create or replace function take_daily_slot(p_day date, p_limit int) returns boolean
language plpgsql as $$
declare c int;
begin
  if p_limit <= 0 then return false; end if;
  insert into daily_usage as u (day, count) values (p_day, 1)
  on conflict (day) do update set count = u.count + 1 where u.count < p_limit
  returning u.count into c;
  return c is not null;
end $$;

-- 요청이 실패로 끝났을 때 한 칸 돌려주기 (사용자 잘못이 아닌 실패는 한도를 쓰지 않게)
create or replace function refund_daily_slot(p_day date) returns void
language sql as $$
  update daily_usage set count = greatest(count - 1, 0) where day = p_day;
$$;

-- AI 호출 기록 (비용 관리: 월 호출 상한 확인용)
create table if not exists ai_usage (
  id             bigserial primary key,
  used_at        timestamptz not null default now(),
  analysis_id    uuid references analyses(id) on delete set null,
  purpose        text not null,               -- analysis
  input_tokens   int,
  output_tokens  int
);
create index if not exists ai_usage_month_idx on ai_usage (used_at);

-- 관리자 로그인 시도 (실패가 쌓이면 잠금)
create table if not exists admin_login_attempts (
  id      bigserial primary key,
  key     text not null,                      -- 방문자 식별 해시
  at      timestamptz not null default now(),
  ok      boolean not null
);
create index if not exists admin_login_attempts_idx on admin_login_attempts (key, at desc);

-- 모든 표에 행 단위 보안을 켜 둡니다. (소유자 계정은 그대로 읽고 쓰고, 외부 공개 API로는 접근 불가)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = current_schema() loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- (이전 버전에 있던 AI 후속 질문 기록 표는 기능을 없애면서 지움)
drop table if exists qa_history;
