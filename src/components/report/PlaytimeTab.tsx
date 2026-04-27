"use client";

import type { AiInsights, StoreStats } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import SentimentBadge from "./SentimentBadge";


interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
}

const SEGMENTS = [
  {
    key: "newbie" as const,
    icon: "🌱",
    label: "뉴비 (하위 25%)",
    color: "emerald",
    borderColor: "border-emerald-200",
    bgColor: "bg-emerald-50",
  },
  {
    key: "normal" as const,
    icon: "🚶",
    label: "일반 (중위 50%)",
    color: "blue",
    borderColor: "border-blue-200",
    bgColor: "bg-blue-50",
  },
  {
    key: "core" as const,
    icon: "💀",
    label: "코어 (상위 25%)",
    color: "purple",
    borderColor: "border-purple-200",
    bgColor: "bg-purple-50",
  },
];

export default function PlaytimeTab({ insights, storeStats }: Props) {
  const pt = insights.playtime_analysis;
  if (!pt) return <div className="text-slate-400 text-sm">플레이타임 분석 데이터가 없습니다.</div>;

  const segData = {
    newbie: { total: storeStats.newbie_total, avg: storeStats.newbie_avg, desc: storeStats.newbie_desc, summary: pt.newbie_summary, title: pt.newbie_title },
    normal: { total: storeStats.norm_total, avg: storeStats.norm_avg, desc: storeStats.norm_desc, summary: pt.normal_summary, title: pt.normal_title },
    core: { total: storeStats.core_total, avg: storeStats.core_avg, desc: storeStats.core_desc, summary: pt.core_summary, title: pt.core_title },
  };

  return (
    <div className="space-y-6">
      {/* Cross comparison insights */}
      {pt.comparison_insights?.length > 0 && (
        <div className="card p-5 bg-amber-50 border-amber-200">
          <p className="text-xs font-semibold text-amber-700 mb-3">⚖️ 핵심 교차 인사이트</p>
          <ul className="space-y-2">
            {pt.comparison_insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3 segment cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SEGMENTS.map((seg) => {
          const data = segData[seg.key];
          const sortedSummary = [...(data.summary ?? [])].sort(
            (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
          );
          return (
            <div key={seg.key} className={`card p-5 border ${seg.borderColor}`}>
              <div className={`rounded-lg p-3 mb-4 ${seg.bgColor}`}>
                <p className="text-lg mb-0.5">{data.title ?? `${seg.icon} ${seg.label}`}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
                  <span>표본 {data.total.toLocaleString()}개</span>
                  <span>평균 {data.avg}시간</span>
                </div>
                <div className="mt-2">
                  <SentimentBadge value={data.desc} />
                </div>
              </div>
              <ul className="space-y-0.5">
                {sortedSummary.map((line, i) => <SentimentLine key={i} line={line} />)}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
        💡 전체 리뷰를 플레이타임순으로 정렬 후, 하위 25%(뉴비), 중위 50%(일반), 상위 25%(코어)로 분할하여 여론을 비교합니다.
      </div>
    </div>
  );
}
