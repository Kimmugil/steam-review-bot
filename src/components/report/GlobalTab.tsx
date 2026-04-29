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

// 권역 트렌드에 따른 카드 배경/테두리/텍스트 색상
function regionCardClass(trend: string): string {
  if (trend.includes("긍정")) return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (trend.includes("부정")) return "bg-red-50 border-red-200 text-red-800";
  if (trend === "복합적") return "bg-amber-50 border-amber-200 text-amber-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

// 도넛 차트 색상 팔레트
const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#ec4899",
  "#94a3b8", // 기타용 (슬레이트)
];

// ── 도넛 차트 ─────────────────────────────────────────────────────────────────
function DonutChart({ storeStats }: { storeStats: StoreStats }) {
  const [view, setView] = useState<"region" | "lang">("region");

  const rawRows = view === "region"
    ? storeStats.table_data_region
    : storeStats.table_data_all;

  // 권역은 전체 표시, 언어는 TOP 10 + 기타
  const TOP_N = view === "region" ? rawRows.length : 10;
  const topRows = rawRows.slice(0, TOP_N);
  const restRows = rawRows.slice(TOP_N);
  const restCount = restRows.reduce((sum, r) => sum + r.count, 0);

  // ratio는 반올림 값이라 합산이 100%가 안 될 수 있음 → count 기반으로 직접 계산
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

  const R = 68, CX = 88, CY = 88;
  const CIRC = 2 * Math.PI * R;
  let cumArc = 0;

  return (
    <div className="card p-5">
      {/* 헤더 + 토글 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="section-label mb-0">🌏 리뷰 비중 분포</p>
          <p className="text-xs text-slate-400 mt-0.5">어느 지역에서 가장 많이 작성했는지 확인하세요.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium flex-shrink-0">
          <button
            onClick={() => setView("region")}
            className={`px-3 py-1.5 transition-colors ${view === "region" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >🗺️ 권역별</button>
          <button
            onClick={() => setView("lang")}
            className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${view === "lang" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >🌍 언어별</button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-8">
        {/* SVG 도넛 차트 — 크기 확대 */}
        <div className="flex-shrink-0 mx-auto sm:mx-0">
          <svg width="176" height="176" viewBox="0 0 176 176">
            {/* 세그먼트 */}
            {segments.map((seg, i) => {
              const arc = (seg.ratio / 100) * CIRC;
              const dashOffset = CIRC / 4 - cumArc;
              cumArc += arc;
              return (
                <circle
                  key={i}
                  cx={CX} cy={CY} r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="26"
                  strokeLinecap="butt"
                  strokeDasharray={`${Math.max(arc - 2.5, 0)} ${CIRC}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
            {/* 중앙 텍스트 */}
            <text x={CX} y={CY - 8} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="500">
              {view === "region" ? "권역 수" : "언어 수"}
            </text>
            <text x={CX} y={CY + 11} textAnchor="middle" fill="#1e293b" fontSize="20" fontWeight="700">
              {view === "region"
                ? `${storeStats.table_data_region.length}개`
                : `${storeStats.table_data_all.length}개`}
            </text>
          </svg>
        </div>

        {/* 범례 — 단일 열, 고정폭 컬럼 정렬 */}
        <div className="flex-1 space-y-1.5">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {/* 순위 */}
              <span className="w-4 text-right text-slate-300 font-mono flex-shrink-0">{i + 1}</span>
              {/* 색상 칩 */}
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
              {/* 이름 — 고정폭으로 번호/비율이 붙어 보이게 */}
              <span className="text-slate-700 w-40 truncate flex-shrink-0">{seg.label}</span>
              {/* 비율 */}
              <span className="font-bold text-slate-800 w-11 text-right flex-shrink-0">
                {seg.ratio.toFixed(1)}%
              </span>
              {/* 리뷰 수 */}
              <span className="text-slate-400 w-16 text-right flex-shrink-0">
                {seg.count.toLocaleString()}개
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 가로 스택 바 차트 ─────────────────────────────────────────────────────────
function StatBarChart({ rows, isRegion = false }: { rows: (TableRow | RegionTableRow)[]; isRegion?: boolean }) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const posW = parsePercent(row.pos_ratio);
        const negW = parsePercent(row.neg_ratio);
        return (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-4 text-xs text-slate-300 text-right flex-shrink-0">{row.rank}</span>
            <span className="w-28 text-xs text-slate-700 font-medium truncate flex-shrink-0">
              {isRegion ? (row as RegionTableRow).region : (row as TableRow).lang_with_flag}
            </span>
            <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${posW}%` }} />
              <div className="absolute inset-y-0 bg-red-400" style={{ left: `${posW}%`, width: `${negW}%` }} />
            </div>
            <span className="text-xs text-slate-400 w-11 text-right flex-shrink-0">{row.ratio}</span>
            <span className="text-xs text-slate-500 w-16 text-right flex-shrink-0">{row.count.toLocaleString()}개</span>
            <div className="w-32 flex-shrink-0 flex justify-end">
              <span className={sentimentClass(row.eval)}>{row.eval}</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 mt-2 pt-2.5 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-3 h-2.5 rounded bg-emerald-400 flex-shrink-0 inline-block" />긍정 비율
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-3 h-2.5 rounded bg-red-400 flex-shrink-0 inline-block" />부정 비율
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-3 h-2.5 rounded bg-slate-200 flex-shrink-0 inline-block" />중립
        </div>
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
      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
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
  const [showAll30, setShowAll30] = useState(false);
  const regData = insights.region_analysis;

  return (
    <div className="space-y-6">

      {/* 도넛 차트 — 리뷰 비중 분포 */}
      <DonutChart storeStats={storeStats} />

      {/* 권역별 분석 */}
      <div className="card p-5">
        <p className="section-label">🗺️ 권역별 세부 평가</p>

        {/* 권역 요약 그리드 */}
        {regData?.regions?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {regData.regions.map((reg, i) => (
              <div key={i} className={`rounded-xl px-3 py-2.5 border ${regionCardClass(reg.trend)}`}>
                <p className="text-xs font-semibold leading-snug">{reg.region}</p>
                <p className="text-xs mt-0.5 opacity-60">{reg.trend}</p>
              </div>
            ))}
          </div>
        )}

        {regData?.divergence_insight && (
          <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600">
            <span className="font-medium text-slate-500 text-xs mr-2">💡 체크포인트</span>
            {regData.divergence_insight}
          </div>
        )}
        <div className="space-y-1.5">
          {regData?.regions?.map((reg, i) => (
            <Collapsible
              key={i}
              title={
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700 text-sm">{reg.region}</span>
                  <SentimentBadge value={reg.trend} />
                </div>
              }
            >
              <div className="pt-3 space-y-3">
                {reg.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-slate-400">키워드</span>
                    {reg.keywords.map((kw, j) => (
                      <span key={j} className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{kw}</span>
                    ))}
                  </div>
                )}
                <div className="space-y-2.5">
                  {[...reg.categories].sort((a, b) =>
                    (a.name.includes("[긍정") ? 0 : 1) - (b.name.includes("[긍정") ? 0 : 1)
                  ).map((cat, j) => (
                    <div key={j}>
                      <p className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${
                        cat.name.includes("[긍정") ? "text-emerald-600" : cat.name.includes("[부정") ? "text-red-500" : "text-slate-500"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sentimentDot(cat.name.includes("[긍정") ? "긍정" : cat.name.includes("[부정") ? "부정" : "")}`} />
                        {cleanCat(cat.name)}
                      </p>
                      <ul>{cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}</ul>
                    </div>
                  ))}
                </div>
              </div>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* 국가별 분석 — 긍정/부정 2열 카드 레이아웃 */}
      <div className="card p-5">
        <p className="section-label">🌍 언어(국가)별 분석</p>
        <p className="text-xs text-slate-400 mb-4">누적 리뷰 작성 언어 상위 3개국 + 한국어 리뷰의 핵심 의견과 유저 원문입니다.</p>
        <div className="space-y-6">
          {insights.country_analysis?.map((country, i) => {
            const posCats = country.categories.filter(c => c.name.includes("[긍정"));
            const negCats = country.categories.filter(c => c.name.includes("[부정"));
            return (
              <div key={i}>
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <span>🚩</span>{country.country}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {posCats.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                      <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />긍정 의견
                      </p>
                      {posCats.map((cat, j) => (
                        <div key={j}>
                          <p className="text-xs font-semibold text-emerald-700 mb-1">{cleanCat(cat.name)}</p>
                          <ul className="mb-1.5">
                            {cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}
                          </ul>
                          {cat.quote?.original && (
                            <QuoteBlock original={cat.quote.original} korean={cat.quote.korean} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {negCats.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                      <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />부정 의견
                      </p>
                      {negCats.map((cat, j) => (
                        <div key={j}>
                          <p className="text-xs font-semibold text-red-600 mb-1">{cleanCat(cat.name)}</p>
                          <ul className="mb-1.5">
                            {cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}
                          </ul>
                          {cat.quote?.original && (
                            <QuoteBlock original={cat.quote.original} korean={cat.quote.korean} />
                          )}
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
        <p className="text-xs text-slate-400 mb-4">리뷰 작성 언어 기준으로 분류됩니다 (실제 국적과 다를 수 있음). 바 색상은 해당 언어 내 긍정/부정 비율을 나타냅니다.</p>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-3">🗺️ 권역별 누적 리뷰 비중</p>
            <StatBarChart rows={storeStats.table_data_region} isRegion />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-3">🥇 언어별 누적 리뷰 TOP 10</p>
            <StatBarChart rows={storeStats.table_data_all.slice(0, 10)} />
            {storeStats.table_data_all.length > 10 && (
              <ExpandButton
                expanded={showAllLang}
                totalCount={storeStats.table_data_all.length}
                onToggle={() => setShowAllLang(!showAllLang)}
              />
            )}
            {showAllLang && <div className="mt-3"><StatBarChart rows={storeStats.table_data_all} /></div>}
          </div>
          {storeStats.days_since_release >= 30 && storeStats.table_data_30?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-3">🔥 최근 기간 언어별 비중 TOP 10</p>
              {storeStats.collection_period && (
                <p className="text-xs text-slate-400 mb-2">{storeStats.collection_period}</p>
              )}
              <StatBarChart rows={storeStats.table_data_30.slice(0, 10)} />
              {storeStats.table_data_30.length > 10 && (
                <ExpandButton
                  expanded={showAll30}
                  totalCount={storeStats.table_data_30.length}
                  onToggle={() => setShowAll30(!showAll30)}
                />
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
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
      >
        {open ? "▲ 접기" : "💬 원문 보기"}
      </button>
      {open && (
        <div className="mt-2 text-xs text-slate-600 bg-white rounded-lg p-3 border border-slate-200 space-y-2">
          <p className="text-slate-500 leading-relaxed">{original}</p>
          {korean && <p className="text-slate-700 leading-relaxed border-t border-slate-200 pt-2">{korean}</p>}
        </div>
      )}
    </div>
  );
}
