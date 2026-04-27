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
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2.5 text-slate-500 font-semibold w-10">순위</th>
            <th className="text-left px-3 py-2.5 text-slate-500 font-semibold">{isRegion ? "권역" : "언어"}</th>
            <th className="text-right px-3 py-2.5 text-slate-500 font-semibold">리뷰 수</th>
            <th className="text-right px-3 py-2.5 text-slate-500 font-semibold">비중</th>
            <th className="text-right px-3 py-2.5 text-emerald-600 font-semibold">긍정</th>
            <th className="text-right px-3 py-2.5 text-red-600 font-semibold">부정</th>
            <th className="text-left px-3 py-2.5 text-slate-500 font-semibold">평가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2 text-slate-400">{row.rank}</td>
              <td className="px-3 py-2 text-slate-700 font-medium">
                {isRegion ? (row as RegionTableRow).region : (row as TableRow).lang_with_flag}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">{Number(row.count).toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-slate-500">{row.ratio}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{row.pos_ratio}</td>
              <td className="px-3 py-2 text-right text-red-500">{row.neg_ratio}</td>
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

export default function GlobalTab({ insights, storeStats }: Props) {
  const [showAllLang, setShowAllLang] = useState(false);
  const [showAll30, setShowAll30] = useState(false);
  const regData = insights.region_analysis;

  function cleanCat(name: string) {
    return name.replace("[긍정]", "").replace("[부정]", "").trim();
  }

  return (
    <div className="space-y-8">
      {/* Region Analysis */}
      <div>
        <h3 className="section-heading">🗺️ 권역별 세부 평가</h3>
        {regData?.divergence_insight && (
          <div className="card p-4 bg-slate-50 mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-1">💡 권역별 주요 체크포인트</p>
            <p className="text-sm text-slate-700">{regData.divergence_insight}</p>
          </div>
        )}
        <div className="space-y-2">
          {regData?.regions?.map((reg, i) => (
            <Collapsible
              key={i}
              title={
                <div className="flex items-center gap-2">
                  <span>{reg.region}</span>
                  <span className="text-slate-400 text-xs">—</span>
                  <SentimentBadge value={reg.trend} />
                </div>
              }
            >
              <div className="pt-3 space-y-4">
                {reg.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-slate-400 mr-1">🔑 키워드:</span>
                    {reg.keywords.map((kw, j) => (
                      <span key={j} className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{kw}</span>
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {[...reg.categories].sort((a, b) =>
                    (a.name.includes("[긍정") ? 0 : 1) - (b.name.includes("[긍정") ? 0 : 1)
                  ).map((cat, j) => (
                    <div key={j}>
                      <p className={`text-xs font-bold mb-1.5 flex items-center gap-1.5 ${
                        cat.name.includes("[긍정") ? "text-emerald-700" : cat.name.includes("[부정") ? "text-red-700" : "text-slate-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sentimentDot(cat.name.includes("[긍정") ? "긍정" : cat.name.includes("[부정") ? "부정" : "")}`} />
                        {cleanCat(cat.name)}
                      </p>
                      <ul>
                        {cat.summary.map((line, k) => <SentimentLine key={k} line={line} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* Country Analysis */}
      <div>
        <h3 className="section-heading">🌍 언어(국가)별 분석</h3>
        <p className="text-xs text-slate-400 mb-4">
          누적 리뷰 작성 언어 상위(TOP) 1위~3위 국가와 &apos;한국어&apos; 리뷰에서 나타난 핵심 의견과 유저 원문을 모아서 보여줍니다.
        </p>
        <div className="space-y-4">
          {insights.country_analysis?.map((country, i) => (
            <div key={i} className="card p-5">
              <h4 className="font-bold text-slate-800 mb-4">🚩 {country.country}</h4>
              <div className="space-y-4">
                {[...country.categories].sort((a, b) =>
                  (a.name.includes("[긍정") ? 0 : 1) - (b.name.includes("[긍정") ? 0 : 1)
                ).map((cat, j) => (
                  <div key={j}>
                    <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${
                      cat.name.includes("[긍정") ? "text-emerald-700" : cat.name.includes("[부정") ? "text-red-700" : "text-slate-600"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        cat.name.includes("[긍정") ? "bg-emerald-500" : cat.name.includes("[부정") ? "bg-red-500" : "bg-slate-400"
                      }`} />
                      {cleanCat(cat.name)}
                    </p>
                    <ul className="mb-2">
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

      {/* Stats Tables */}
      <div>
        <h3 className="section-heading">🌐 글로벌 언어 및 권역 통계표</h3>
        <p className="text-xs text-slate-400 mb-4">
          💡 스팀 리뷰 특성상 유저의 실제 국적이 아닌 &apos;리뷰 작성 언어&apos;를 기준으로 분류됩니다.
        </p>

        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-2">🗺️ 주요 권역별 누적 리뷰 비중</p>
            <StatTable rows={storeStats.table_data_region} isRegion />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-600 mb-2">🥇 언어별 누적 리뷰 비중 TOP 10</p>
            <StatTable rows={storeStats.table_data_all.slice(0, 10)} />
            {storeStats.table_data_all.length > 10 && (
              <button
                onClick={() => setShowAllLang(!showAllLang)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showAllLang ? "▲ 접기" : `▼ 전체 ${storeStats.table_data_all.length}개 언어 보기`}
              </button>
            )}
            {showAllLang && <div className="mt-2"><StatTable rows={storeStats.table_data_all} /></div>}
          </div>

          {storeStats.days_since_release >= 30 && storeStats.table_data_30?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-2">🔥 최근 30일 언어별 비중 TOP 10</p>
              <p className="text-xs text-slate-400 mb-2">📅 수집 기간: {storeStats.collection_period}</p>
              <StatTable rows={storeStats.table_data_30.slice(0, 10)} />
              {storeStats.table_data_30.length > 10 && (
                <button
                  onClick={() => setShowAll30(!showAll30)}
                  className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showAll30 ? "▲ 접기" : `▼ 전체 ${storeStats.table_data_30.length}개 보기`}
                </button>
              )}
              {showAll30 && <div className="mt-2"><StatTable rows={storeStats.table_data_30} /></div>}
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
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        {open ? "▲ 원문 접기" : "👀 유저 리뷰 원문 보기"}
      </button>
      {open && (
        <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border-l-2 border-slate-300 space-y-1.5">
          <p className="text-slate-500">원문: {original}</p>
          {korean && <p className="text-slate-600">번역: {korean}</p>}
        </div>
      )}
    </div>
  );
}
