import { getAllReports } from "@/lib/sheets";
import { formatDateTime, sentimentClass, sentimentBg } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";
import { ExternalLink } from "lucide-react";

export const revalidate = 60;

export default async function DashboardPage() {
  const reports = await getAllReports();

  // Group by game
  const byGame = reports.reduce<Record<string, ReportIndex[]>>((acc, r) => {
    const key = `${r.app_id}::${r.game_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const games = Object.entries(byGame).map(([key, reps]) => {
    const [appId, gameName] = key.split("::");
    const latest = reps[0]; // already reversed (newest first)
    return { appId, gameName, reports: reps, latest };
  }).sort((a, b) => b.latest.analysis_time.localeCompare(a.latest.analysis_time));

  const publishedReports = reports.filter((r) => r.notion_published);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">리포트 대시보드</h1>
        <p className="text-slate-500 text-sm">
          총 {reports.length}개 분석 기록 · {games.length}개 게임 · {publishedReports.length}개 노션 발행
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
        <div className="space-y-8">
          {/* Published reports section */}
          {publishedReports.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                📤 노션 발행된 리포트
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {publishedReports.slice(0, 12).map((r) => (
                  <div key={r.uuid} className="card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">{r.game_name}</p>
                      <span className={sentimentClass(r.all_desc)}>{r.all_desc}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{formatDateTime(r.analysis_time)}</p>
                    <div className="flex items-center gap-2">
                      <a href={`/report/${r.uuid}`} className="text-xs text-slate-600 hover:text-slate-800 font-medium transition-colors">
                        리포트 보기
                      </a>
                      {r.notion_url && (
                        <a href={r.notion_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-0.5 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                          노션
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* By game */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">🎮 게임별 분석 기록</h2>
            <div className="space-y-4">
              {games.map(({ appId, gameName, reports: gameReports, latest }) => (
                <div key={appId} className="card overflow-hidden">
                  {/* Game header */}
                  <div className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between ${sentimentBg(latest.all_desc)}`}>
                    <div>
                      <h3 className="font-bold text-base leading-tight">{gameName}</h3>
                      <p className="text-xs opacity-60 mt-0.5">App ID: {appId} · 총 {gameReports.length}회 분석</p>
                    </div>
                    <span className={sentimentClass(latest.all_desc)}>{latest.all_desc}</span>
                  </div>
                  {/* Reports list */}
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
                        <div className="flex items-center gap-2">
                          {r.notion_published && (
                            r.notion_url ? (
                              <a href={r.notion_url} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-0.5 transition-colors">
                                <ExternalLink className="w-3 h-3" />
                                노션
                              </a>
                            ) : (
                              <span className="text-xs text-violet-400">📤 발행됨</span>
                            )
                          )}
                          <span className="text-xs text-slate-300 group-hover:text-slate-500 transition-colors">→</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
