"use client";

import type { AiInsights, StoreStats } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import Collapsible from "./Collapsible";
import { sentimentBg } from "@/lib/utils";

interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
  recentLabel: string;
  smartReason: string;
}

function MetricCard({ label, sub, value, count }: { label: string; sub: string; value: string; count?: number | null }) {
  return (
    <div className={`rounded-xl p-4 border ${sentimentBg(value)}`}>
      <p className="text-xs font-medium opacity-60 mb-1">{label}</p>
      <p className="text-sm font-bold leading-snug">{value}</p>
      {count != null && <p className="text-xs opacity-50 mt-1">{count.toLocaleString()}개</p>}
      <p className="text-xs opacity-40 mt-0.5 leading-tight">{sub}</p>
    </div>
  );
}

function cleanCat(name: string) {
  return name.replace(/^\[(긍정|부정)\]\s*/, "").trim();
}

export default function SummaryTab({ insights, storeStats, recentLabel, smartReason }: Props) {
  const posCategories = insights.global_category_summary?.filter((c) => c.category.includes("[긍정")) ?? [];
  const negCategories = insights.global_category_summary?.filter((c) => c.category.includes("[부정")) ?? [];
  const etcCategories = insights.global_category_summary?.filter((c) => !c.category.includes("[긍정") && !c.category.includes("[부정")) ?? [];

  const sortedAll = [...(insights.final_summary_all ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );
  const sortedRecent = [...(insights.final_summary_recent ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );

  return (
    <div className="space-y-5">
      {/* Rating metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="스팀 공식 평점" sub="직접 구매 기준" value={storeStats.official_desc} />
        <MetricCard label="전체 누적 평점" sub="모든 유저 포함" value={storeStats.all_desc} count={storeStats.all_total} />
        <MetricCard label={recentLabel} sub={smartReason.slice(0, 28) + "…"} value={storeStats.recent_desc} count={storeStats.recent_total} />
      </div>

      {/* Sentiment briefing */}
      <div className="card p-5">
        <p className="section-label">🎯 종합 여론 브리핑</p>
        <p className="text-sm text-slate-700 leading-relaxed">{insights.sentiment_analysis}</p>
      </div>

      {/* Summary columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="section-label">📈 누적 여론</p>
          <ul className="space-y-0">
            {sortedAll.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
        <div className="card p-5">
          <p className="section-label">🔥 {recentLabel} 동향</p>
          <p className="text-xs text-slate-400 mb-2">{storeStats.collection_period}</p>
          <ul className="space-y-0">
            {sortedRecent.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
      </div>

      {/* Category breakdown */}
      {insights.global_category_summary?.length > 0 && (
        <div className="card p-5">
          <p className="section-label">📁 카테고리별 평가</p>
          <div className="space-y-2">
            {posCategories.length > 0 && (
              <Collapsible
                title={<span className="text-sm font-medium text-emerald-700">✅ 긍정 항목 ({posCategories.length}개)</span>}
                defaultOpen={true}
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
                title={<span className="text-sm font-medium text-red-600">⚠️ 부정 항목 ({negCategories.length}개)</span>}
                defaultOpen={true}
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
              <Collapsible title={<span className="text-sm font-medium text-slate-500">📌 기타 ({etcCategories.length}개)</span>}>
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
