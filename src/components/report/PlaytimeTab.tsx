"use client";

import type { AiInsights, StoreStats } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import SentimentBadge from "./SentimentBadge";

interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
}

const SEGMENTS = [
  { key: "newbie" as const, icon: "🌱", label: "뉴비",  sub: "하위 25%", bg: "#56D0A0", barColor: "#10b981" },
  { key: "normal" as const, icon: "🚶", label: "일반",  sub: "중위 50%", bg: "#FFD600", barColor: "#f59e0b" },
  { key: "core"   as const, icon: "💀", label: "코어",  sub: "상위 25%", bg: "#F0EFEC", barColor: "#6366f1" },
];

export default function PlaytimeTab({ insights, storeStats }: Props) {
  const pt = insights.playtime_analysis;
  if (!pt) return (
    <div className="card p-6 text-sm" style={{ color: "#9CA3AF" }}>플레이타임 분석 데이터가 없습니다.</div>
  );

  const sampleTotal = storeStats.playtime_sample_total
    ?? storeStats.newbie_total + storeStats.norm_total + storeStats.core_total;

  const segData = {
    newbie: { total: storeStats.newbie_total, avg: storeStats.newbie_avg, desc: storeStats.newbie_desc, summary: pt.newbie_summary, title: pt.newbie_title },
    normal: { total: storeStats.norm_total,   avg: storeStats.norm_avg,   desc: storeStats.norm_desc,   summary: pt.normal_summary, title: pt.normal_title },
    core:   { total: storeStats.core_total,   avg: storeStats.core_avg,   desc: storeStats.core_desc,   summary: pt.core_summary,   title: pt.core_title   },
  };

  const maxAvg = Math.max(storeStats.newbie_avg, storeStats.norm_avg, storeStats.core_avg);

  return (
    <div className="space-y-5">

      {/* 표본 안내 */}
      <div
        className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl"
        style={{ background: "#FAFAFA", border: "2px solid #E2E8F0" }}
      >
        <span>📊</span>
        <span style={{ color: "#4A4A4A" }}>
          플레이타임 전용 표본{" "}
          <strong style={{ color: "#1A1A1A" }}>{sampleTotal.toLocaleString()}개</strong>{" "}
          리뷰를 플레이타임순 정렬 후 하위 25% / 중위 50% / 상위 25%로 분할 분석
        </span>
      </div>

      {/* 평균 플레이타임 비교 차트 */}
      <div className="card p-5">
        <p className="section-label">⏱ 유저 유형별 평균 플레이타임</p>
        <div className="space-y-4 mt-1">
          {SEGMENTS.map((seg) => {
            const data = segData[seg.key];
            const barW = maxAvg > 0 ? (data.avg / maxAvg) * 100 : 0;
            const samplePct = sampleTotal > 0 ? ((data.total / sampleTotal) * 100).toFixed(0) : "0";
            return (
              <div key={seg.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-black" style={{ color: "#1A1A1A" }}>
                    {seg.icon} {seg.label}
                    <span className="text-xs font-bold ml-1.5" style={{ color: "#9CA3AF" }}>
                      {seg.sub}
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>표본 {samplePct}%</span>
                    <span className="font-black text-base" style={{ color: "#1A1A1A" }}>{data.avg}h</span>
                  </div>
                </div>
                <div
                  className="h-6 rounded-full overflow-hidden"
                  style={{ background: "#F0EFEC", border: "2px solid #1A1A1A" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${barW}%`, backgroundColor: seg.barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: "#9CA3AF" }}>* 막대 길이는 세 유형 중 최대값 대비 상대 비율입니다.</p>
      </div>

      {/* 핵심 교차 인사이트 */}
      {pt.comparison_insights?.length > 0 && (
        <div
          className="card p-5"
          style={{ background: "#FFFDE7", borderColor: "#1A1A1A" }}
        >
          <p className="section-label" style={{ color: "#92400e" }}>⚖️ 핵심 교차 인사이트</p>
          <ul className="space-y-2">
            {pt.comparison_insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#1A1A1A" }}>
                <span className="font-black flex-shrink-0 mt-0.5" style={{ color: "#f59e0b" }}>→</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3 세그먼트 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SEGMENTS.map((seg) => {
          const data = segData[seg.key];
          const sorted = [...(data.summary ?? [])].sort(
            (a, b) => (a.startsWith("[긍정]") ? 0 : 1) - (b.startsWith("[긍정]") ? 0 : 1)
          );
          return (
            <div key={seg.key} className="card p-5 flex flex-col">
              {/* 세그먼트 헤더 */}
              <div
                className="rounded-xl px-4 py-3 mb-4"
                style={{ background: seg.bg, border: "2px solid #1A1A1A" }}
              >
                <p className="font-black text-sm mb-1" style={{ color: "#1A1A1A" }}>
                  {seg.icon} {seg.label}
                  <span className="text-xs font-bold ml-1.5" style={{ opacity: 0.6 }}>{seg.sub}</span>
                </p>
                <div className="flex items-center gap-3 text-xs mb-2" style={{ color: "#4A4A4A" }}>
                  <span>표본 <strong style={{ color: "#1A1A1A" }}>{data.total.toLocaleString()}개</strong></span>
                  <span>평균 <strong style={{ color: "#1A1A1A" }}>{data.avg}h</strong></span>
                </div>
                <SentimentBadge value={data.desc} />
              </div>
              {/* 요약 리스트 */}
              <ul className="space-y-0 flex-1">
                {sorted.map((line, i) => <SentimentLine key={i} line={line} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
