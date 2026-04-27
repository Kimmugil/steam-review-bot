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

export default function SummaryTab({ insights, storeStats, recentLabel, smartReason }: Props) {
  const posCategories = insights.global_category_summary?.filter((c) => c.category.includes("[긍정")) ?? [];
  const negCategories = insights.global_category_summary?.filter((c) => c.category.includes("[부정")) ?? [];
  const etcCategories = insights.global_category_summary?.filter((c) => !c.category.includes("[긍정") && !c.category.includes("[부정")) ?? [];

  function cleanCat(name: string) {
    return name.replace("[긍정]", "").replace("[부정]", "").trim();
  }

  const sortedSummaryAll = [...(insights.final_summary_all ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );
  const sortedSummaryRecent = [...(insights.final_summary_recent ?? [])].sort(
    (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
  );

  return (
    <div className="space-y-6">
      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "🛑 스팀 공식 평점", value: storeStats.official_desc, sub: "직접 구매 유저 기준", count: null },
          { label: "📈 전체 누적 평점", value: storeStats.all_desc, sub: "모든 유저 포함", count: storeStats.all_total },
          { label: `🔥 ${recentLabel}`, value: storeStats.recent_desc, sub: smartReason.slice(0, 30) + "…", count: storeStats.recent_total },
        ].map((m) => (
          <div key={m.label} className={`rounded-xl p-4 border ${sentimentBg(m.value)}`}>
            <p className="text-xs font-medium opacity-70 mb-2">{m.label}</p>
            <p className="text-base font-bold leading-tight">{m.value}</p>
            {m.count !== null && (
              <p className="text-xs opacity-60 mt-1">{m.count.toLocaleString()}개</p>
            )}
          </div>
        ))}
      </div>

      {/* Sentiment briefing */}
      <div className="card p-5">
        <p className="text-xs font-semibold text-slate-500 mb-2">🎯 종합 여론 브리핑</p>
        <p className="text-sm text-slate-700 leading-relaxed">{insights.sentiment_analysis}</p>
      </div>

      {/* Summary columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="section-heading text-sm">📈 누적 여론 동향</h3>
          <ul className="space-y-0.5">
            {sortedSummaryAll.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="section-heading text-sm">🔥 {recentLabel} 동향</h3>
          <p className="text-xs text-slate-400 mb-3">📅 수집 기간: {storeStats.collection_period}</p>
          <ul className="space-y-0.5">
            {sortedSummaryRecent.map((line, i) => <SentimentLine key={i} line={line} />)}
          </ul>
        </div>
      </div>

      {/* Category breakdown */}
      {insights.global_category_summary?.length > 0 && (
        <div>
          <h3 className="section-heading">📁 카테고리별 상세 평가</h3>
          <div className="space-y-2">
            {posCategories.length > 0 && (
              <Collapsible
                title={<span className="text-emerald-700 font-semibold">✅ 긍정 평가 항목 ({posCategories.length}개)</span>}
                defaultOpen={true}
              >
                <div className="space-y-3 pt-3">
                  {posCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-bold text-emerald-700 mb-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                        {cleanCat(cat.category)}
                      </p>
                      <ul>
                        {cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
            {negCategories.length > 0 && (
              <Collapsible
                title={<span className="text-red-700 font-semibold">⚠️ 부정 평가 항목 ({negCategories.length}개)</span>}
                defaultOpen={true}
              >
                <div className="space-y-3 pt-3">
                  {negCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-bold text-red-700 mb-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />
                        {cleanCat(cat.category)}
                      </p>
                      <ul>
                        {cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
            {etcCategories.length > 0 && (
              <Collapsible title={<span className="text-slate-600 font-semibold">📌 기타 평가 항목 ({etcCategories.length}개)</span>}>
                <div className="space-y-3 pt-3">
                  {etcCategories.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-bold text-slate-600 mb-1.5">{cleanCat(cat.category)}</p>
                      <ul>
                        {cat.summary.map((line, j) => <SentimentLine key={j} line={line} />)}
                      </ul>
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
