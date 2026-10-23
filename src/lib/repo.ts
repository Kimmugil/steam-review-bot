import { kstDay, plain, sql, type Row } from "./db";
import type { AnalysisRow, SampleReview } from "./types";

/** 목록·카드에 필요한 열만 (큰 JSON은 제외) */
const LIST_COLS = sql`id, app_id, game_name, header_image, release_date, status, step, error, method_version, hidden, requested_via,
  requested_at, started_at, finished_at, period_days, period_start, period_end, recent_label, all_desc, all_total, recent_desc, recent_total, one_liner,
  (stats->'official'->>'rate')::float8 as official_rate, (stats->'recent'->>'rate')::float8 as recent_rate`;

export async function listDone(limit = 60, includeHidden = false): Promise<Row[]> {
  const rows = await sql`select ${LIST_COLS} from analyses
    where status = 'done' ${includeHidden ? sql`` : sql`and not hidden`} order by finished_at desc nulls last limit ${limit}`;
  return plain(rows as unknown as Row[]);
}

/** 같은 게임의 진행 중 분석과 가장 최근 완료된 분석 (중복 안내용) */
export async function lookupGame(appId: number): Promise<{ active: Row | null; latest: Row | null }> {
  const [active] = await sql`select ${LIST_COLS} from analyses where app_id = ${appId} and status in ('queued','running') limit 1`;
  const [latest] = await sql`select ${LIST_COLS} from analyses where app_id = ${appId} and status = 'done' and not hidden order by finished_at desc nulls last limit 1`;
  return { active: active ? plain(active as Row) : null, latest: latest ? plain(latest as Row) : null };
}

/** 같은 게임의 완료된 분석 기록 (최신순). 리포트 화면에서 지난 분석을 골라 볼 수 있게. */
export async function listVersionsOfGame(appId: number): Promise<{ id: string; finished_at: string; method_version: number; all_desc: string | null }[]> {
  return plain((await sql`select id, finished_at, method_version, all_desc from analyses
    where app_id = ${appId} and status = 'done' and not hidden order by finished_at desc nulls last limit 50`) as unknown as { id: string; finished_at: string; method_version: number; all_desc: string | null }[]);
}

export async function getAnalysis(id: string): Promise<AnalysisRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await sql`select * from analyses where id = ${id}`;
  return row ? (plain(row) as unknown as AnalysisRow) : null;
}

/** 근거로 가리킨 표본 번호들의 원문 (화면의 '근거 리뷰 보기'용) */
export async function getSamplesByNo(id: string, nos: number[]): Promise<Row[]> {
  if (!nos.length) return [];
  return plain((await sql`select sample_no as n, language as lang, voted_up, playtime_h, review as text from review_samples
    where analysis_id = ${id} and sample_no in ${sql(nos)} order by sample_no`) as unknown as Row[]);
}

// ───────────── 요청 접수 ─────────────
export async function getDailyLimit(): Promise<number> {
  const [r] = await sql`select value from app_settings where key = 'daily_limit'`;
  const n = Number(r?.value);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

export async function usageToday(): Promise<{ day: string; used: number; limit: number }> {
  const day = kstDay();
  const [r] = await sql`select count from daily_usage where day = ${day}`;
  return { day, used: Number(r?.count ?? 0), limit: await getDailyLimit() };
}

export type NewRequest = { appId: number; name: string; headerImage: string | null; releaseDate: string | null; via: "web" | "admin"; requesterHash: string | null };

/**
 * 새 분석 요청 접수. 결과:
 *  - { kind: 'limit' }   오늘 한도를 모두 썼음
 *  - { kind: 'active' }  같은 게임이 이미 진행 중 → 그 분석을 알려 줌 (한도 소모 없음)
 *  - { kind: 'created' } 새로 접수됨 (한도 1칸 사용)
 * 한도 확인과 접수가 어긋나지 않도록 DB 함수로 한 번에 처리하고, 접수에 실패하면 칸을 돌려줍니다.
 */
export async function createRequest(r: NewRequest): Promise<{ kind: "limit" } | { kind: "active"; analysis: Row } | { kind: "created"; id: string }> {
  const existing = (await lookupGame(r.appId)).active;
  if (existing) return { kind: "active", analysis: existing };
  const day = kstDay();
  const limit = await getDailyLimit();
  if (r.via === "web") {
    const [ok] = await sql`select take_daily_slot(${day}::date, ${limit}) as ok`;
    if (!ok?.ok) return { kind: "limit" };
  }
  try {
    const [row] = await sql`insert into analyses (app_id, game_name, header_image, release_date, requested_via, requester_hash)
      values (${r.appId}, ${r.name}, ${r.headerImage}, ${r.releaseDate}, ${r.via}, ${r.requesterHash}) returning id`;
    return { kind: "created", id: row.id as string };
  } catch (e) {
    if (r.via === "web") await sql`select refund_daily_slot(${day}::date)`;
    // 동시에 같은 게임을 접수한 경우: 이미 진행 중인 분석을 돌려줌
    if ((e as { code?: string }).code === "23505") {
      const a = (await lookupGame(r.appId)).active;
      if (a) return { kind: "active", analysis: a };
    }
    throw e;
  }
}

export async function refundSlotFor(requestedAt: string | Date) {
  await sql`select refund_daily_slot(${kstDay(new Date(requestedAt))}::date)`;
}

// ───────────── 진행 상태 ─────────────
export async function markRunning(id: string) {
  await sql`update analyses set status = 'running', step = 'game_info', started_at = now(), error = null where id = ${id}`;
}
export async function setStep(id: string, step: string) {
  await sql`update analyses set step = ${step} where id = ${id}`;
}
export async function markFailed(id: string, error: string) {
  await sql`update analyses set status = 'failed', error = ${error.slice(0, 500)}, finished_at = now() where id = ${id}`;
}

/** 아직 대기·진행 중인 분석만 실패로 바꾸고(이미 끝난 것은 건드리지 않음), 방문자 요청이면 한도 1칸을 돌려줍니다. */
export async function failIfActive(id: string, error: string): Promise<boolean> {
  const [r] = await sql`update analyses set status = 'failed', error = ${error.slice(0, 500)}, finished_at = now()
    where id = ${id} and status in ('queued','running') returning requested_via, requested_at`;
  if (!r) return false;
  if (r.requested_via === "web") await refundSlotFor(r.requested_at as Date);
  return true;
}

export async function saveDone(id: string, p: {
  game: { name: string; headerImage: string | null; releaseDate: string | null };
  period: { days: number; start: string; end: string; label: string; reason: string };
  summary: { allDesc: string; allTotal: number; recentDesc: string; recentTotal: number; oneLiner: string | null };
  stats: unknown; ai: unknown; news: unknown; samples: SampleReview[];
}) {
  await sql.begin(async (tx) => {
    await tx`delete from review_samples where analysis_id = ${id}`;
    for (let i = 0; i < p.samples.length; i += 200) {
      const chunk = p.samples.slice(i, i + 200).map((s) => ({ analysis_id: id, sample_no: s.n, kind: "recent", language: s.lang, voted_up: s.voted_up, playtime_h: s.playtime_h, review: s.text, recommendation_id: s.rid }));
      await tx`insert into review_samples ${tx(chunk, "analysis_id", "sample_no", "kind", "language", "voted_up", "playtime_h", "review", "recommendation_id")}`;
    }
    await tx`update analyses set status = 'done', step = null, error = null, finished_at = now(), method_version = 2,
      game_name = ${p.game.name}, header_image = ${p.game.headerImage}, release_date = ${p.game.releaseDate},
      period_days = ${p.period.days}, period_start = ${p.period.start}, period_end = ${p.period.end}, recent_label = ${p.period.label}, smart_reason = ${p.period.reason},
      all_desc = ${p.summary.allDesc}, all_total = ${p.summary.allTotal}, recent_desc = ${p.summary.recentDesc}, recent_total = ${p.summary.recentTotal}, one_liner = ${p.summary.oneLiner},
      stats = ${tx.json(p.stats as never)}, ai = ${p.ai == null ? null : tx.json(p.ai as never)}, news = ${tx.json(p.news as never)} where id = ${id}`;
  });
}

export async function upsertGame(appId: number, name: string, headerImage: string | null, releaseDate: string | null) {
  await sql`insert into games (app_id, name, header_image, release_date) values (${appId}, ${name}, ${headerImage}, ${releaseDate})
    on conflict (app_id) do update set name = excluded.name, header_image = excluded.header_image, release_date = excluded.release_date, updated_at = now()`;
}

// ───────────── AI 사용량 ─────────────
export async function aiCallsThisMonth(): Promise<{ used: number; cap: number }> {
  const [u] = await sql`select count(*)::int as n from ai_usage where used_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`;
  const [c] = await sql`select value from app_settings where key = 'ai_monthly_call_cap'`;
  const cap = Number(c?.value);
  return { used: Number(u?.n ?? 0), cap: Number.isFinite(cap) && cap >= 0 ? cap : 300 };
}
export async function recordAi(analysisId: string | null, purpose: "analysis" | "qa", input: number | null, output: number | null) {
  await sql`insert into ai_usage (analysis_id, purpose, input_tokens, output_tokens) values (${analysisId}, ${purpose}, ${input}, ${output})`;
}

// ───────────── 후속 질문 ─────────────
export async function getQa(id: string): Promise<Row[]> {
  return plain((await sql`select id, question, answer, asked_at from qa_history where analysis_id = ${id} order by id`) as unknown as Row[]);
}
export async function saveQa(id: string, question: string, answer: string) {
  await sql`insert into qa_history (analysis_id, question, answer) values (${id}, ${question.slice(0, 500)}, ${answer})`;
}

// ───────────── 오래 멈춘 분석 정리 ─────────────
/** 30분 넘게 진행 중인 분석은 멈춘 것으로 보고 실패 처리합니다(대기열이 영원히 막히지 않게). */
export async function reapStuck(): Promise<number> {
  const rows = await sql`update analyses set status = 'failed', error = '진행이 30분 넘게 멈춰 자동으로 실패 처리했습니다. 다시 요청해 주세요.', finished_at = now()
    where status in ('queued','running') and requested_at < now() - interval '30 minutes' returning id, requested_via, requested_at`;
  for (const r of rows) if (r.requested_via === "web") await refundSlotFor(r.requested_at as Date);
  return rows.length;
}
