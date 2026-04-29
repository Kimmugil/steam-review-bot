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

function metricBg(evalStr: string): { bg: string; color: string } {
  if (evalStr.includes("긍정")) return { bg: "#D1FAE5", color: "#065F46" };
  if (evalStr.includes("부정")) return { bg: "#FEE2E2", color: "#991B1B" };
  if (evalStr === "복합적")     return { bg: "#FEF9C3", color: "#854D0E" };
  return { bg: "#F0EFEC", color: "#4A4A4A" };
}

function MetricCard({ label, sub, value, count }: {
  label: string; sub: string; value: string; count?: number | null;
}) {
  const { bg, color } = metricBg(value);
  return (
    <div
      className="p-4 flex flex-col gap-1"
      style={{ background: bg, border: "2px solid #1A1A1A", borderRadius: 14 }}
    >
      <p className="text-xs font-bold" style={{ color: "#1A1A1A", opacity: 0.6 }}>{label}</p>
      <p className="font-black text-base leading-tight" style={{ color, fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>{value}</p>
      {count != null && (
        <p className="text-xs font-bold" style={{ color, opacity: 0.55 }}>{count.toLocaleString()}개</p>
      )}
      <p className="text-xs leading-tight line-clamp-2" style={{ color, opacity: 0.5 }} title={sub}>{sub}</p>
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

  const sortedAll    = [...(insights.final_summary_all    ?? [])].sort((a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1));
  const sortedRecent = [...(insights.final_summary_recent ?? [])].sort((a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1));

  return (
    <div className="space-y-5">

      {/* 평점 메트릭 3열 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="스팀 공식 평점"    sub="직접 구매 유저 기준"   value={storeStats.official_desc} />
        <MetricCard label="전체 누적 평점"    sub="모든 유저 포함"         value={storeStats.all_desc}    count={storeStats.all_total} />
        <MetricCard label={recentLabel}       sub={smartReason}           value={storeStats.recent_desc} count={storeStats.recent_total} />
      </div>

      {/* 종합 여론 */}
      <div className="card p-5">
        <p className="section-label">🎯 종합 여론 브리핑</p>
        <p className="text-sm leading-relaxed" style={{ color: "#1A1A1A" }}>{insights.sentiment_analysis}</p>
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
            <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>{storeStats.collection_period}</p>
          )}
          <ul className="space-y-0">
            {sortedRecent.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
      </div>

      {/* 카테고리별 평가 */}
      {insights.global_category_summary?.length > 0 && (
        <div className="card p-5">
          <p className="section-label">📁 카테고리별 평가</p>
          <div className="space-y-2">
            {posCategories.length > 0 && (
              <Collapsible
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black" style={{ color: "#059669" }}>✅ 긍정 항목 ({posCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {posCategories.map((cat, i) => (
                        <span key={i} className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#D1FAE5", border: "2px solid #6EE7B7", color: "#065F46" }}>
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
                      <p className="text-xs font-black mb-1 flex items-center gap-1.5" style={{ color: "#059669" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#6EE7B7" }} />
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
                    <span className="text-sm font-black" style={{ color: "#DC2626" }}>⚠️ 부정 항목 ({negCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {negCategories.map((cat, i) => (
                        <span key={i} className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#FEE2E2", border: "2px solid #FCA5A5", color: "#991B1B" }}>
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
                      <p className="text-xs font-black mb-1 flex items-center gap-1.5" style={{ color: "#DC2626" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#FCA5A5" }} />
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
                    <span className="text-sm font-black" style={{ color: "#4A4A4A" }}>📌 기타 ({etcCategories.length}개)</span>
                    <div className="flex flex-wrap gap-1">
                      {etcCategories.map((cat, i) => (
                        <span key={i} className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#F0EFEC", border: "2px solid #1A1A1A", color: "#4A4A4A" }}>
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
                      <p className="text-xs font-black mb-1" style={{ color: "#4A4A4A" }}>{cleanCat(cat.category)}</p>
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
