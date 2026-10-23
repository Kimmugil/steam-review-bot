import { plain, sql, type Row } from "./db";
import { aiCallsThisMonth, usageToday } from "./repo";

/** 관리자 현황판에 필요한 값 */
export async function getAdminData() {
  const [usage, ai, week, rows, tok] = await Promise.all([
    usageToday(),
    aiCallsThisMonth(),
    sql`select day::text as day, count from daily_usage where day >= (now() at time zone 'Asia/Seoul')::date - 6 order by day`,
    sql`select id, app_id, game_name, header_image, status, step, error, method_version, hidden, requested_via, requested_at, finished_at,
               all_desc, recent_label, recent_desc, (select count(*)::int from review_samples r where r.analysis_id = a.id) as samples
        from analyses a order by requested_at desc limit 200`,
    sql`select coalesce(sum(input_tokens),0)::bigint as i, coalesce(sum(output_tokens),0)::bigint as o from ai_usage
        where used_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`,
  ]);
  const analyses = plain(rows as unknown as Row[]);
  return {
    usage, ai: { ...ai, inputTokens: Number(tok[0].i), outputTokens: Number(tok[0].o) },
    week: plain(week as unknown as Row[]),
    analyses,
    counts: {
      active: analyses.filter((a) => a.status === "queued" || a.status === "running").length,
      failed7: analyses.filter((a) => a.status === "failed" && Date.now() - new Date(a.requested_at).getTime() < 7 * 86400000).length,
      done: analyses.filter((a) => a.status === "done").length,
      legacy: analyses.filter((a) => a.method_version === 1).length,
    },
  };
}
export type AdminData = Awaited<ReturnType<typeof getAdminData>>;
