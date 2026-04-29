import { getAllReports, getUiTexts } from "@/lib/sheets";
import { formatDateTime, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";
import { unstable_cache } from "next/cache";
import { ChevronRight } from "lucide-react";

export const revalidate = 60;

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });

function steamThumb(appId: string) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
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
    <div className="max-w-4xl mx-auto px-4 py-10">

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
        <div className="space-y-6">
          {games.map(({ appId, gameName, reports: gameReports, latest }) => (
            <div
              key={appId}
              className="overflow-hidden"
              style={{ border: "2px solid #1A1A1A", borderRadius: 20, background: "#FFFFFF" }}
            >
              {/* ── 게임 헤더 (썸네일 + 기본 정보) ── */}
              <div className="flex gap-0" style={{ borderBottom: "2px solid #1A1A1A" }}>
                {/* 썸네일 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={steamThumb(appId)}
                  alt={gameName}
                  className="object-cover flex-shrink-0"
                  style={{ width: 140, height: 90, borderRight: "2px solid #1A1A1A", display: "block" }}
                  // 이미지 로드 실패 시 숨기기는 클라이언트에서만 가능 — Server Component이므로 fallback 없이 진행
                />
                {/* 정보 */}
                <div className="flex-1 px-4 py-3 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-base leading-tight" style={{ color: "#1A1A1A" }}>
                        {gameName}
                      </h3>
                      <span className={`${sentimentClass(latest.all_desc)} flex-shrink-0`}>
                        {latest.all_desc}
                      </span>
                    </div>
                    {latest.one_liner && (
                      <p className="text-xs mt-1 leading-snug line-clamp-2 italic" style={{ color: "#4A4A4A" }}>
                        &ldquo;{latest.one_liner}&rdquo;
                      </p>
                    )}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>
                    App ID: {appId} · 총 {gameReports.length}회 분석
                  </p>
                </div>
              </div>

              {/* ── 분석 기록 리스트 ── */}
              <div>
                {gameReports.map((r, idx) => (
                  <a
                    key={r.uuid}
                    href={`/report/${r.uuid}`}
                    className="flex items-center justify-between px-4 py-3 group transition-colors hover:bg-[#FAFAFA]"
                    style={{
                      borderTop: idx > 0 ? "1px solid #E2E8F0" : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <p className="text-xs font-bold flex-shrink-0" style={{ color: "#1A1A1A" }}>
                        {formatDateTime(r.analysis_time)}
                      </p>
                      <span className={sentimentClass(r.recent_desc)}>{r.recent_desc}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: "#9CA3AF" }}>
                        최근 {r.recent_total.toLocaleString()}개
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: "#9CA3AF" }}>
                        · {r.collection_period}
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className="flex-shrink-0 transition-transform group-hover:translate-x-1 ml-2"
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
