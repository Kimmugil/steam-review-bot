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

function StatTable({ rows, isRegion = false }: { rows: (TableRow | RegionTableRow)[]; isRegion?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 text-slate-400 font-medium w-10">#</th>
            <th className="text-left px-3 py-2 text-slate-400 font-medium">{isRegion ? "권역" : "언어"}</th>
            <th className="text-right px-3 py-2 text-slate-400 font-medium">리뷰 수</th>
            <th className="text-right px-3 py-2 text-slate-400 font-medium">비중</th>
            <th className="text-right px-3 py-2 text-emerald-500 font-medium">긍정</th>
            <th className="text-right px-3 py-2 text-red-400 font-medium">부정</th>
            <th className="text-left px-3 py-2 text-slate-400 font-medium">평가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
              <td className="px-3 py-2 text-slate-300">{row.rank}</td>
              <td className="px-3 py-2 text-slate-700 font-medium">
                {isRegion ? (row as RegionTableRow).region : (row as TableRow).lang_with_flag}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">{row.count.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-slate-400">{row.ratio}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{row.pos_ratio}</td>
              <td className="px-3 py-2 text-right text-red-400">{row.neg_ratio}</td>
              <td className="px-3 py-2">
                <span className={sentimentClass(row.eval)}>{row.eval}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 전체 보기 버튼 — 텍스트 링크가 아닌 명확한 버튼 스타일
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

      {/* 글로벌 통계표 */}
      <div className="card p-5">
        <p className="section-label">📊 글로벌 통계표</p>
        <p className="text-xs text-slate-400 mb-4">리뷰 작성 언어 기준으로 분류됩니다 (실제 국적과 다를 수 있음).</p>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">🗺️ 권역별 누적 리뷰 비중</p>
            <StatTable rows={storeStats.table_data_region} isRegion />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">🥇 언어별 누적 리뷰 TOP 10</p>
            <StatTable rows={storeStats.table_data_all.slice(0, 10)} />
            {storeStats.table_data_all.length > 10 && (
              <ExpandButton
                expanded={showAllLang}
                totalCount={storeStats.table_data_all.length}
                onToggle={() => setShowAllLang(!showAllLang)}
              />
            )}
            {showAllLang && <div className="mt-3"><StatTable rows={storeStats.table_data_all} /></div>}
          </div>
          {storeStats.days_since_release >= 30 && storeStats.table_data_30?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">🔥 최근 기간 언어별 비중 TOP 10</p>
              {storeStats.collection_period && (
                <p className="text-xs text-slate-400 mb-2">{storeStats.collection_period}</p>
              )}
              <StatTable rows={storeStats.table_data_30.slice(0, 10)} />
              {storeStats.table_data_30.length > 10 && (
                <ExpandButton
                  expanded={showAll30}
                  totalCount={storeStats.table_data_30.length}
                  onToggle={() => setShowAll30(!showAll30)}
                />
              )}
              {showAll30 && <div className="mt-3"><StatTable rows={storeStats.table_data_30} /></div>}
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
