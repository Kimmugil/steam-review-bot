import { getAllReports, getUiTexts } from "@/lib/sheets";
import { formatDateTime, sentimentClass, sentimentHeaderBg } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";
import { unstable_cache } from "next/cache";

export const revalidate = 60;

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });

export default async function DashboardPage() {
  const [reports, t] = await Promise.all([getAllReports(), getCachedUiTexts()]);

  // Group by game
  const byGame = reports.reduce<Record<string, ReportIndex[]>>((acc, r) => {
    const key = `${r.app_id}::${r.game_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const games = Object.entries(byGame).map(([key, reps]) => {
    const [appId, gameName] = key.split("::");
    const latest = reps[0];
    return { appId, gameName, reports: reps, latest };
  }).sort((a, b) => b.latest.analysis_time.localeCompare(a.latest.analysis_time));

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t.dashboard_title ?? "리포트 대시보드"}</h1>
        <p className="text-slate-500 text-sm">
          총 {reports.length}개 분석 기록 · {games.length}개 게임
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🌾</div>
          <p className="text-slate-500">아직 분석 기록이 없습니다.</p>
          <a href="/" className="mt-4 inline-block text-sm text-slate-700 font-medium underline">
            게임 분석 시작하기 →
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {games.map(({ appId, gameName, reports: gameReports, latest }) => (
            <div key={appId} className="card overflow-hidden">
              <div className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between ${sentimentHeaderBg(latest.all_desc)}`}>
                <div>
                  <h3 className="font-bold text-base leading-tight">{gameName}</h3>
                  <p className="text-xs opacity-60 mt-0.5">App ID: {appId} · 총 {gameReports.length}회 분석</p>
                </div>
                <span className={sentimentClass(latest.all_desc)}>{latest.all_desc}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {gameReports.map((r) => (
                  <a key={r.uuid} href={`/report/${r.uuid}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-slate-400">{formatDateTime(r.analysis_time)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">수집 기간: {r.collection_period}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={sentimentClass(r.recent_desc)}>{r.recent_desc}</span>
                        <span className="text-xs text-slate-400">최근 {r.recent_total.toLocaleString()}개</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-300 group-hover:text-slate-500 transition-colors">→</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
