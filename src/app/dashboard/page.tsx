import { getAllReports, getUiTexts } from "@/lib/sheets";
import { formatDateTime, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";
import { unstable_cache } from "next/cache";
import { ChevronRight } from "lucide-react";

export const revalidate = 60;

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });

// 감성에 따른 헤더 배경색
function sentimentBg(evalStr: string): string {
  if (evalStr.includes("긍정")) return "#56D0A0";
  if (evalStr.includes("부정")) return "#FF6B6B";
  if (evalStr === "복합적")    return "#FFD600";
  return "#F0EFEC";
}

export default async function DashboardPage() {
  const [reports, t] = await Promise.all([getAllReports(), getCachedUiTexts()]);

  const byGame = reports.reduce<Record<string, ReportIndex[]>>((acc, r) => {
    const key = `${r.app_id}::${r.game_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const games = Object.entries(byGame).map(([key, reps]) => {
    const [appId, gameName] = key.split("::");
    return { appId, gameName, reports: reps, latest: reps[0] };
  }).sort((a, b) => b.latest.analysis_time.localeCompare(a.latest.analysis_time));

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-black" style={{ fontSize: 28, color: "#1A1A1A" }}>
            {t.dashboard_title ?? "리포트 대시보드"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#4A4A4A" }}>
            총 {reports.length}개 분석 기록 · {games.length}개 게임
          </p>
        </div>
        <a
          href="/"
          className="neo-button px-4 py-2 text-sm flex-shrink-0"
          style={{ backgroundColor: "#FFD600", color: "#1A1A1A" }}
        >
          + 새 분석
        </a>
      </div>

      {/* Empty state */}
      {reports.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ border: "2px dashed #E2E8F0", borderRadius: 16 }}
        >
          <p className="text-4xl mb-3">🌾</p>
          <p className="font-black text-base" style={{ color: "#1A1A1A" }}>아직 분석 기록이 없습니다.</p>
          <p className="text-sm mt-1 mb-5" style={{ color: "#9CA3AF" }}>
            게임을 분석하면 여기에 기록이 쌓입니다.
          </p>
          <a
            href="/"
            className="neo-button px-5 py-2 text-sm"
            style={{ backgroundColor: "#FFD600", color: "#1A1A1A" }}
          >
            🚜 첫 탈곡 시작하기
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {games.map(({ appId, gameName, reports: gameReports, latest }) => (
            <div
              key={appId}
              className="overflow-hidden"
              style={{ border: "2px solid #1A1A1A", borderRadius: 16, background: "#FFFFFF" }}
            >
              {/* 게임 헤더 */}
              <div
                className="px-5 py-4 flex items-center justify-between gap-3"
                style={{
                  borderBottom: "2px solid #1A1A1A",
                  backgroundColor: sentimentBg(latest.all_desc),
                }}
              >
                <div>
                  <h3 className="font-black text-base leading-tight" style={{ color: "#1A1A1A" }}>
                    {gameName}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "#4A4A4A" }}>
                    App ID: {appId} · 총 {gameReports.length}회 분석
                  </p>
                </div>
                <span className={sentimentClass(latest.all_desc)}>{latest.all_desc}</span>
              </div>

              {/* 분석 기록 리스트 */}
              <div>
                {gameReports.map((r, idx) => (
                  <a
                    key={r.uuid}
                    href={`/report/${r.uuid}`}
                    className="flex items-center justify-between px-5 py-3.5 group transition-colors"
                    style={{
                      borderTop: idx > 0 ? "1px solid #E2E8F0" : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-bold" style={{ color: "#1A1A1A" }}>
                          {formatDateTime(r.analysis_time)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          수집 기간: {r.collection_period}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={sentimentClass(r.recent_desc)}>{r.recent_desc}</span>
                        <span className="text-xs" style={{ color: "#9CA3AF" }}>
                          최근 {r.recent_total.toLocaleString()}개
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="flex-shrink-0 transition-transform group-hover:translate-x-1"
                      style={{ color: "#9CA3AF" }}
                    />
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
