import { getAllReports, getUiTexts } from "@/lib/sheets";
import { unstable_cache } from "next/cache";
import type { ReportIndex } from "@/lib/types";
import ItemCard from "@/components/ItemCard";

export const revalidate = 60;

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });

const ROTATIONS = [1.2, -1.0, 0.8, -1.5, 1.0, -0.8];

export default async function DashboardPage() {
  const [reports, t] = await Promise.all([getAllReports(), getCachedUiTexts()]);

  // 게임별 최신 1개만 추출 (마퀴와 달리 카탈로그형)
  const byGame = reports.reduce<Record<string, ReportIndex[]>>((acc, r) => {
    const key = r.app_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // 게임별 최신 리포트 1장만 꺼내고, 최신 분석순으로 정렬
  const games = Object.values(byGame)
    .map(reps => ({ latest: reps[0], count: reps.length }))
    .sort((a, b) => b.latest.analysis_time.localeCompare(a.latest.analysis_time));

  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: 1200 }}>

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
      {games.length === 0 ? (
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
        <div
          className="grid gap-6 items-start"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}
        >
          {games.map(({ latest, count }, i) => (
            <div key={latest.app_id} className="relative">
              <ItemCard r={latest} rotate={ROTATIONS[i % ROTATIONS.length]} />
              {/* 분석 횟수 뱃지 */}
              {count > 1 && (
                <a
                  href={`/dashboard/${latest.app_id}`}
                  className="absolute top-2 left-2 text-xs font-black px-2 py-0.5 rounded-full"
                  style={{
                    background: "#1A1A1A", color: "#FFFFFF",
                    border: "2px solid #1A1A1A",
                    textDecoration: "none",
                    zIndex: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  총 {count}회 분석
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
