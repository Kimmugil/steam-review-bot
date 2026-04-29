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

// 가로 스택 바 차트 — StatTable 대체 (Proposal A)
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
            {/* 긍정(초록) / 부정(빨강) 스택 바 */}
            <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-400"
                style={{ width: `${posW}%` }}
              />
              <div
                className="absolute inset-y-0 bg-red-400"
                style={{ left: `${posW}%`, width: `${negW}%` }}
              />
            </div>
            {/* 전체 비중 */}
            <span className="text-xs text-slate-400 w-11 text-right flex-shrink-0">{row.ratio}</span>
            {/* 리뷰 수 */}
            <span className="text-xs text-slate-500 w-16 text-right flex-shrink-0">{row.count.toLocaleString()}개</span>
            {/* 평가 뱃지 */}
            <span className={`flex-shrink-0 ${sentimentClass(row.eval)}`}>{row.eval}</span>
          </div>
        );
      })}
      {/* 범례 */}
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

// 전체 보기 버튼
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

      {/* 권역별 분석 */}
      <div className="card p-5">
        <p className="section-label">🗺️ 권역별 세부 평가</p>

        {/* 권역 요약 그리드 (Proposal C) — 한눈에 전체 권역 분위기 파악 */}
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

      {/* 국가별 분석 */}
      <div className="card p-5">
        <p className="section-label">🌍 언어(국가)별 분석</p>
        <p className="text-xs text-slate-400 mb-4">누적 리뷰 작성 언어 상위 3개국 + 한국어 리뷰의 핵심 의견과 유저 원문입니다.</p>
        <div className="space-y-5">
          {insights.country_analysis?.map((country, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span>🚩</span>{country.country}
              </h4>
              <div className="space-y-3 pl-4 border-l-2 border-slate-100">
                {[...country.categories].sort((a, b) =>
                  (a.name.includes("[긍정") ? 0 : 1) - (b.name.includes("[긍정") ? 0 : 1)
                ).map((cat, j) => (
                  <div key={j}>
                    <p className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${
                      cat.name.includes("[긍정") ? "text-emerald-600" : cat.name.includes("[부정") ? "text-red-500" : "text-slate-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        cat.name.includes("[긍정") ? "bg-emerald-500" : cat.name.includes("[부정") ? "bg-red-400" : "bg-slate-400"
                      }`} />
                      {cleanCat(cat.name)}
                    </p>
                    <ul className="mb-1.5">
                      {cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}
                    </ul>
                    {cat.quote?.original && (
                      <QuoteBlock original={cat.quote.original} korean={cat.quote.korean} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 글로벌 통계 차트 (Proposal A) */}
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
        <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border-l-2 border-slate-200 space-y-2">
          <p className="text-slate-500 leading-relaxed">{original}</p>
          {korean && <p className="text-slate-700 leading-relaxed border-t border-slate-200 pt-2">{korean}</p>}
        </div>
      )}
    </div>
  );
}
