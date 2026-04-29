"use client";

import { useState } from "react";
import type { AiInsights, StoreStats, TableRow, RegionTableRow } from "@/lib/types";
import SentimentLine from "./SentimentLine";
import SentimentBadge from "./SentimentBadge";
import Collapsible from "./Collapsible";
import { sentimentClass, sentimentDot } from "@/lib/utils";

interface Props {
  insights: AiInsights;
  storeStats: StoreStats;
}

function parsePercent(str: string): number {
  return parseFloat(str) || 0;
}

// 권역 트렌드 색상
function regionBg(trend: string): { bg: string; border: string } {
  if (trend.includes("긍정")) return { bg: "#D1FAE5", border: "#6EE7B7" };
  if (trend.includes("부정")) return { bg: "#FEE2E2", border: "#FCA5A5" };
  if (trend === "복합적")     return { bg: "#FEF9C3", border: "#FDE047" };
  return { bg: "#F0EFEC", border: "#1A1A1A" };
}

// 도넛 팔레트
const PALETTE = [
  "#6366f1","#10b981","#f59e0b","#3b82f6","#ef4444",
  "#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899",
  "#94a3b8",
];

// ── 도넛 차트 ──────────────────────────────────────────────────────────────
function DonutChart({ storeStats }: { storeStats: StoreStats }) {
  const [view, setView] = useState<"region" | "lang">("region");

  const rawRows = view === "region" ? storeStats.table_data_region : storeStats.table_data_all;
  const TOP_N   = view === "region" ? rawRows.length : 10;
  const topRows = rawRows.slice(0, TOP_N);
  const restRows = rawRows.slice(TOP_N);
  const restCount = restRows.reduce((sum, r) => sum + r.count, 0);

  const totalCount = rawRows.reduce((sum, r) => sum + r.count, 0);
  const toRatio = (count: number) => totalCount > 0 ? (count / totalCount) * 100 : 0;

  const segments = [
    ...topRows.map((row, i) => ({
      label: view === "region"
        ? (row as RegionTableRow).region
        : (row as TableRow).lang_with_flag,
      ratio: toRatio(row.count),
      count: row.count,
      eval: row.eval,
      color: PALETTE[i % (PALETTE.length - 1)],
    })),
    ...(restCount > 0
      ? [{ label: `기타 ${restRows.length}개 언어`, ratio: toRatio(restCount), count: restCount, eval: "", color: PALETTE[PALETTE.length - 1] }]
      : []),
  ];

  const totalRatio = segments.reduce((sum, s) => sum + s.ratio, 0);
  const GAP = 1;
  const parts: string[] = [];
  let cumDeg = 0;
  for (const seg of segments) {
    const deg   = (seg.ratio / totalRatio) * 360;
    const start = cumDeg + (deg > GAP * 2 ? GAP / 2 : 0);
    const end   = cumDeg + deg - (deg > GAP * 2 ? GAP / 2 : 0);
    parts.push(`${seg.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
    if (deg > GAP * 2) parts.push(`white ${end.toFixed(2)}deg ${(cumDeg + deg).toFixed(2)}deg`);
    cumDeg += deg;
  }
  const conicGradient = `conic-gradient(from -90deg, ${parts.join(", ")})`;

  return (
    <div className="card p-5">
      {/* 헤더 + 토글 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="section-label mb-0">🌏 리뷰 비중 분포</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>어느 지역에서 가장 많이 작성했는지 확인하세요.</p>
        </div>
        {/* 토글 버튼 */}
        <div
          className="flex overflow-hidden flex-shrink-0 text-xs font-black"
          style={{ border: "2px solid #1A1A1A", borderRadius: 9999 }}
        >
          {([["region", "🗺️ 권역별"], ["lang", "🌍 언어별"]] as const).map(([v, label], idx) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: view === v ? "#1A1A1A" : "#FFFFFF",
                color:      view === v ? "#FFFFFF"  : "#4A4A4A",
                borderLeft: idx > 0 ? "2px solid #1A1A1A" : "none",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        {/* 도넛 */}
        <div className="flex-shrink-0 relative" style={{ width: 176, height: 176 }}>
          <div className="rounded-full absolute inset-0" style={{ background: conicGradient, border: "2px solid #1A1A1A" }} />
          <div
            className="rounded-full absolute flex flex-col items-center justify-center"
            style={{ top: 30, left: 30, width: 116, height: 116, background: "#FFFFFF", border: "2px solid #1A1A1A" }}
          >
            <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700 }}>
              {view === "region" ? "권역 수" : "언어 수"}
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#1A1A1A", lineHeight: 1.2 }}>
              {view === "region"
                ? `${storeStats.table_data_region.length}개`
                : `${storeStats.table_data_all.length}개`}
            </span>
          </div>
        </div>

        {/* 범례 */}
        <div className="space-y-1.5">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-right font-bold flex-shrink-0" style={{ color: "#9CA3AF", minWidth: "1.5rem" }}>{i + 1}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color, border: "1px solid #1A1A1A" }} />
              <span className="w-36 truncate flex-shrink-0 font-bold" style={{ color: "#1A1A1A" }}>{seg.label}</span>
              <span className="font-black w-11 text-right flex-shrink-0" style={{ color: "#1A1A1A" }}>{seg.ratio.toFixed(1)}%</span>
              <span className="w-16 text-right flex-shrink-0" style={{ color: "#9CA3AF" }}>{seg.count.toLocaleString()}개</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 스택 바 차트 ───────────────────────────────────────────────────────────
function StatBarChart({ rows, isRegion = false }: { rows: (TableRow | RegionTableRow)[]; isRegion?: boolean }) {
  return (
    <div className="space-y-2.5">
      {rows.map((row, i) => {
        const posW = parsePercent(row.pos_ratio);
        const negW = parsePercent(row.neg_ratio);
        return (
          <div key={i} className="flex items-center gap-2.5">
            <span className="text-xs text-right flex-shrink-0 font-bold" style={{ color: "#9CA3AF", minWidth: "2rem" }}>{row.rank}</span>
            <span className="w-28 text-xs font-black truncate flex-shrink-0" style={{ color: "#1A1A1A" }}>
              {isRegion ? (row as RegionTableRow).region : (row as TableRow).lang_with_flag}
            </span>
            <div
              className="flex-1 h-5 rounded-full overflow-hidden relative"
              style={{ background: "#F0EFEC", border: "1px solid #E2E8F0" }}
            >
              <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${posW}%`, background: "#6EE7B7" }} />
              <div className="absolute inset-y-0" style={{ left: `${posW}%`, width: `${negW}%`, background: "#FCA5A5" }} />
            </div>
            <span className="text-xs w-11 text-right flex-shrink-0 font-bold" style={{ color: "#4A4A4A" }}>{row.ratio}</span>
            <span className="text-xs w-16 text-right flex-shrink-0" style={{ color: "#9CA3AF" }}>{row.count.toLocaleString()}개</span>
            <div className="w-32 flex-shrink-0 flex justify-end">
              <span className={sentimentClass(row.eval)}>{row.eval}</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 mt-1 pt-2.5" style={{ borderTop: "1px solid #E2E8F0" }}>
        {[["#6EE7B7", "긍정 비율"], ["#FCA5A5", "부정 비율"], ["#F0EFEC", "중립"]].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
            <span className="w-3 h-2.5 rounded inline-block flex-shrink-0" style={{ background: color, border: "1px solid #E2E8F0" }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpandButton({ expanded, totalCount, onToggle }: {
  expanded: boolean; totalCount: number; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="mt-3 neo-button px-4 py-1.5 text-xs"
      style={{ background: "#F0EFEC", color: "#1A1A1A" }}
    >
      {expanded ? "▲ 접기" : `▼ 전체 ${totalCount}개 보기`}
    </button>
  );
}

function cleanCat(name: string) {
  return name.replace(/^\[(긍정|부정)\]\s*/, "").trim();
}

export default function GlobalTab({ insights, storeStats }: Props) {
  const [showAllLang, setShowAllLang] = useState(false);
  const [showAll30,   setShowAll30]   = useState(false);
  const regData = insights.region_analysis;

  return (
    <div className="space-y-6">

      {/* 도넛 차트 */}
      <DonutChart storeStats={storeStats} />

      {/* 권역별 분석 */}
      <div className="card p-5">
        <p className="section-label">🗺️ 권역별 세부 평가</p>

        {/* 권역 그리드 */}
        {regData?.regions?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {regData.regions.map((reg, i) => {
              const { bg } = regionBg(reg.trend);
              return (
                <div
                  key={i}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: bg, border: "2px solid #1A1A1A" }}
                >
                  <p className="text-xs font-black leading-snug" style={{ color: "#1A1A1A" }}>{reg.region}</p>
                  <p className="text-xs mt-0.5 font-bold" style={{ color: "#1A1A1A", opacity: 0.6 }}>{reg.trend}</p>
                </div>
              );
            })}
          </div>
        )}

        {regData?.divergence_insight && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm"
            style={{ background: "#FAFAFA", border: "2px solid #E2E8F0" }}
          >
            <span className="font-black text-xs mr-2" style={{ color: "#9CA3AF" }}>💡 체크포인트</span>
            <span style={{ color: "#1A1A1A" }}>{regData.divergence_insight}</span>
          </div>
        )}

        <div className="space-y-1.5">
          {regData?.regions?.map((reg, i) => (
            <Collapsible
              key={i}
              title={
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm" style={{ color: "#1A1A1A" }}>{reg.region}</span>
                  <SentimentBadge value={reg.trend} />
                </div>
              }
            >
              <div className="pt-3 space-y-3">
                {reg.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs font-bold" style={{ color: "#9CA3AF" }}>키워드</span>
                    {reg.keywords.map((kw, j) => (
                      <span key={j} className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "#F0EFEC", border: "2px solid #1A1A1A", color: "#4A4A4A" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-2.5">
                  {[...reg.categories].sort((a, b) =>
                    (a.name.includes("[긍정") ? 0 : 1) - (b.name.includes("[긍정") ? 0 : 1)
                  ).map((cat, j) => {
                    const isPos = cat.name.includes("[긍정");
                    const isNeg = cat.name.includes("[부정");
                    return (
                      <div key={j}>
                        <p className="text-xs font-black mb-1 flex items-center gap-1.5"
                          style={{ color: isPos ? "#059669" : isNeg ? "#DC2626" : "#4A4A4A" }}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sentimentDot(isPos ? "긍정" : isNeg ? "부정" : "")}`} />
                          {cleanCat(cat.name)}
                        </p>
                        <ul>{cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}</ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* 국가별 분석 */}
      <div className="card p-5">
        <p className="section-label">🌍 언어(국가)별 분석</p>
        <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
          누적 리뷰 작성 언어 상위 3개국 + 한국어 리뷰의 핵심 의견과 유저 원문입니다.
        </p>
        <div className="space-y-6">
          {insights.country_analysis?.map((country, i) => {
            const posCats = country.categories.filter(c => c.name.includes("[긍정"));
            const negCats = country.categories.filter(c => c.name.includes("[부정"));
            return (
              <div key={i}>
                <h4 className="font-black text-sm mb-3 flex items-center gap-2" style={{ color: "#1A1A1A" }}>
                  <span>🚩</span>{country.country}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {posCats.length > 0 && (
                    <div
                      className="p-4 space-y-3 rounded-2xl"
                      style={{ background: "#f0fdf4", border: "2px solid #1A1A1A" }}
                    >
                      <p className="text-xs font-black flex items-center gap-1.5" style={{ color: "#059669" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#56D0A0" }} />긍정 의견
                      </p>
                      {posCats.map((cat, j) => (
                        <div key={j}>
                          <p className="text-xs font-black mb-1" style={{ color: "#059669" }}>{cleanCat(cat.name)}</p>
                          <ul className="mb-1.5">{cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}</ul>
                          {cat.quote?.original && <QuoteBlock original={cat.quote.original} korean={cat.quote.korean} />}
                        </div>
                      ))}
                    </div>
                  )}
                  {negCats.length > 0 && (
                    <div
                      className="p-4 space-y-3 rounded-2xl"
                      style={{ background: "#fff5f5", border: "2px solid #1A1A1A" }}
                    >
                      <p className="text-xs font-black flex items-center gap-1.5" style={{ color: "#DC2626" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#FF6B6B" }} />부정 의견
                      </p>
                      {negCats.map((cat, j) => (
                        <div key={j}>
                          <p className="text-xs font-black mb-1" style={{ color: "#DC2626" }}>{cleanCat(cat.name)}</p>
                          <ul className="mb-1.5">{cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}</ul>
                          {cat.quote?.original && <QuoteBlock original={cat.quote.original} korean={cat.quote.korean} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 글로벌 통계 차트 */}
      <div className="card p-5">
        <p className="section-label">📊 글로벌 통계 차트</p>
        <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
          리뷰 작성 언어 기준으로 분류됩니다 (실제 국적과 다를 수 있음). 바 색상은 긍정/부정 비율을 나타냅니다.
        </p>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-black mb-3" style={{ color: "#4A4A4A" }}>🗺️ 권역별 누적 리뷰 비중</p>
            <StatBarChart rows={storeStats.table_data_region} isRegion />
          </div>
          <div>
            <p className="text-xs font-black mb-3" style={{ color: "#4A4A4A" }}>🥇 언어별 누적 리뷰 TOP 10</p>
            <StatBarChart rows={storeStats.table_data_all.slice(0, 10)} />
            {storeStats.table_data_all.length > 10 && (
              <ExpandButton expanded={showAllLang} totalCount={storeStats.table_data_all.length} onToggle={() => setShowAllLang(!showAllLang)} />
            )}
            {showAllLang && <div className="mt-3"><StatBarChart rows={storeStats.table_data_all} /></div>}
          </div>
          {storeStats.days_since_release >= 30 && storeStats.table_data_30?.length > 0 && (
            <div>
              <p className="text-xs font-black mb-3" style={{ color: "#4A4A4A" }}>🔥 최근 기간 언어별 비중 TOP 10</p>
              {storeStats.collection_period && (
                <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>{storeStats.collection_period}</p>
              )}
              <StatBarChart rows={storeStats.table_data_30.slice(0, 10)} />
              {storeStats.table_data_30.length > 10 && (
                <ExpandButton expanded={showAll30} totalCount={storeStats.table_data_30.length} onToggle={() => setShowAll30(!showAll30)} />
              )}
              {showAll30 && <div className="mt-3"><StatBarChart rows={storeStats.table_data_30} /></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteBlock({ original, korean }: { original: string; korean?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs font-bold transition-opacity hover:opacity-70"
        style={{ color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}
      >
        {open ? "▲ 접기" : "💬 원문 보기"}
      </button>
      {open && (
        <div
          className="mt-2 text-xs p-3 space-y-2 rounded-xl"
          style={{ background: "#FFFFFF", border: "2px solid #E2E8F0" }}
        >
          <p className="leading-relaxed" style={{ color: "#4A4A4A" }}>{original}</p>
          {korean && (
            <p className="leading-relaxed pt-2" style={{ color: "#1A1A1A", borderTop: "1px solid #E2E8F0" }}>{korean}</p>
          )}
        </div>
      )}
    </div>
  );
}
