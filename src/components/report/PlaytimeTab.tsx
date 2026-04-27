"use client";

import type { AiInsights, StoreStats } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import SentimentBadge from "./SentimentBadge";

interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
}

const SEGMENTS = [
  { key: "newbie" as const, icon: "🌱", label: "뉴비", sub: "하위 25%", border: "border-emerald-200", bg: "bg-emerald-50/50", dot: "bg-emerald-500" },
  { key: "normal" as const, icon: "🚶", label: "일반",  sub: "중위 50%", border: "border-blue-200",   bg: "bg-blue-50/50",   dot: "bg-blue-500"   },
  { key: "core"   as const, icon: "💀", label: "코어",  sub: "상위 25%", border: "border-violet-200", bg: "bg-violet-50/50", dot: "bg-violet-500" },
];

export default function PlaytimeTab({ insights, storeStats }: Props) {
  const pt = insights.playtime_analysis;
  if (!pt) return <div className="text-slate-400 text-sm p-4">플레이타임 분석 데이터가 없습니다.</div>;

  const sampleTotal = storeStats.playtime_sample_total ?? storeStats.newbie_total + storeStats.norm_total + storeStats.core_total;

  const segData = {
    newbie: { total: storeStats.newbie_total, avg: storeStats.newbie_avg, desc: storeStats.newbie_desc, summary: pt.newbie_summary, title: pt.newbie_title },
    normal: { total: storeStats.norm_total,   avg: storeStats.norm_avg,   desc: storeStats.norm_desc,   summary: pt.normal_summary, title: pt.normal_title },
    core:   { total: storeStats.core_total,   avg: storeStats.core_avg,   desc: storeStats.core_desc,   summary: pt.core_summary,   title: pt.core_title   },
  };

  return (
    <div className="space-y-5">
      {/* Sample size note */}
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-2.5">
        <span>📊</span>
        <span>
          플레이타임 전용 표본 <strong className="text-slate-600">{sampleTotal.toLocaleString()}개</strong> 리뷰를 플레이타임순 정렬 후 하위 25% / 중위 50% / 상위 25%로 분할 분석
        </span>
      </div>

      {/* Cross comparison insights */}
      {pt.comparison_insights?.length > 0 && (
        <div className="card p-5 bg-amber-50 border-amber-200">
          <p className="section-label text-amber-600">⚖️ 핵심 교차 인사이트</p>
          <ul className="space-y-2">
            {pt.comparison_insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                <span className="text-amber-400 flex-shrink-0 mt-0.5 font-bold">→</span>
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
          const sorted = [...(data.summary ?? [])].sort(
            (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
          );
          return (
            <div key={seg.key} className={`card p-5 border ${seg.border}`}>
              <div className={`rounded-xl px-4 py-3 mb-4 ${seg.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${seg.dot}`} />
                  <span className="text-sm font-semibold text-slate-700">{seg.icon} {seg.label}</span>
                  <span className="text-xs text-slate-400">{seg.sub}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                  <span>표본 <strong className="text-slate-700">{data.total.toLocaleString()}개</strong></span>
                  <span>평균 <strong className="text-slate-700">{data.avg}h</strong></span>
                </div>
                <SentimentBadge value={data.desc} />
              </div>
              <ul className="space-y-0">
                {sorted.map((line, i) => <SentimentLine key={i} line={line} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
