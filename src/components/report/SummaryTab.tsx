"use client";

import type { AiInsights, StoreStats } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import Collapsible from "./Collapsible";

interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
  recentLabel: string;
  smartReason: string;
}

// border 미포함 — 이미 border를 가진 카드 컨텍스트에서 사용
function metricCardBg(evalStr: string): string {
  if (evalStr.includes("긍정")) return "bg-emerald-50 text-emerald-800";
  if (evalStr.includes("부정")) return "bg-red-50 text-red-800";
  if (evalStr === "복합적") return "bg-amber-50 text-amber-800";
  return "bg-slate-50 text-slate-700";
}

function MetricCard({
  label, sub, value, count,
}: {
  label: string; sub: string; value: string; count?: number | null;
}) {
  return (
    <div className={`rounded-xl p-4 border border-slate-200 ${metricCardBg(value)}`}>
      <p className="text-xs font-medium opacity-60 mb-1">{label}</p>
      <p className="text-sm font-bold leading-snug">{value}</p>
      {count != null && <p className="text-xs opacity-50 mt-1">{count.toLocaleString()}개</p>}
      {/* 전체 텍스트를 title로 제공해 hover 시 확인 가능 */}
      <p className="text-xs opacity-40 mt-0.5 leading-tight line-clamp-2" title={sub}>{sub}</p>
    </div>
  );
}

function cleanCat(name: string) {
  return name.replace(/^\[(긍정|부정)\]\s*/, "").trim();
}

export default function SummaryTab({ insights, storeStats, recentLabel, smartReason }: Props) {
  const posCategories = insights.global_category_summary?.filter((c) => c.category.includes("[긍정")) ?? [];
  const negCategories = insights.global_category_summary?.filter((c) => c.category.includes("[부정")) ?? [];
  const etcCategories = insights.global_category_summary?.filter(
    (c) => !c.category.includes("[긍정") && !c.category.includes("[부정")
  ) ?? [];

  const sortedAll = [...(insights.final_summary_all ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );
  const sortedRecent = [...(insights.final_summary_recent ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );

  return (
    <div className="space-y-5">

      {/* 평점 메트릭 — 모바일(1열) → sm 이상(3열) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="스팀 공식 평점"
          sub="직접 구매 유저 기준"
          value={storeStats.official_desc}
        />
        <MetricCard
          label="전체 누적 평점"
          sub="모든 유저 포함"
          value={storeStats.all_desc}
          count={storeStats.all_total}
        />
        <MetricCard
          label={recentLabel}
          sub={smartReason}
          value={storeStats.recent_desc}
          count={storeStats.recent_total}
        />
      </div>

      {/* 종합 여론 브리핑 */}
      <div className="card p-5">
        <p className="section-label">🎯 종합 여론 브리핑</p>
        <p className="text-sm text-slate-700 leading-relaxed">{insights.sentiment_analysis}</p>
      </div>

      {/* 여론 동향 2열 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="section-label">📈 누적 여론</p>
          <ul className="space-y-0">
            {sortedAll.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
        <div className="card p-5">
          <p className="section-label">🔥 {recentLabel} 동향</p>
          {storeStats.collection_period && (
            <p className="text-xs text-slate-400 mb-2">{storeStats.collection_period}</p>
          )}
          <ul className="space-y-0">
            {sortedRecent.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
      </div>

      {/* 카테고리별 평가 — Collapsible defaultOpen=false로 첫 로드 스크롤 최소화 */}
      {insights.global_category_summary?.length > 0 && (
        <div className="card p-5">
          <p className="section-label">📁 카테고리별 평가</p>
          <div className="space-y-2">
            {posCategories.length > 0 && (
              <Collapsible
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-emerald-700">✅ 긍정 항목 ({posCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {posCategories.map((cat, i) => (
                        <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {cleanCat(cat.category)}
                        </span>
                      ))}
                    </div>
                  </div>
                }
                defaultOpen={false}
              >
                <div className="space-y-3 pt-2">
                  {posCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-emerald-600 mb-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        {cleanCat(cat.category)}
                      </p>
                      <ul>{cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}</ul>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
            {negCategories.length > 0 && (
              <Collapsible
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-red-600">⚠️ 부정 항목 ({negCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {negCategories.map((cat, i) => (
                        <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                          {cleanCat(cat.category)}
                        </span>
                      ))}
                    </div>
                  </div>
                }
                defaultOpen={false}
              >
                <div className="space-y-3 pt-2">
                  {negCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-red-500 mb-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        {cleanCat(cat.category)}
                      </p>
                      <ul>{cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}</ul>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
            {etcCategories.length > 0 && (
              <Collapsible
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-500">📌 기타 ({etcCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {etcCategories.map((cat, i) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                          {cleanCat(cat.category)}
                        </span>
                      ))}
                    </div>
                  </div>
                }
                defaultOpen={false}
              >
                <div className="space-y-3 pt-2">
                  {etcCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-slate-500 mb-1">{cleanCat(cat.category)}</p>
                      <ul>{cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}</ul>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
