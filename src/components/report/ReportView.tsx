"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/types";
import SentimentBadge from "./SentimentBadge";

// 헤더 이미지 위에 올라가는 뱃지 — 어두운 배경에서도 잘 보이도록 솔리드 색상 사용
function HeaderBadge({ value }: { value: string }) {
  let cls = "bg-emerald-500 text-white border-emerald-600";
  if (value.includes("부정")) cls = "bg-red-500 text-white border-red-600";
  else if (value === "복합적") cls = "bg-amber-500 text-white border-amber-600";
  else if (!value.includes("긍정")) cls = "bg-slate-500 text-white border-slate-600";
  return (
    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border shadow-lg whitespace-nowrap ${cls}`}>
      {value}
    </span>
  );
}
import SummaryTab from "./SummaryTab";
import NewsTab from "./NewsTab";
import PlaytimeTab from "./PlaytimeTab";
import GlobalTab from "./GlobalTab";
import QASection from "./QASection";
import { formatDate, formatDateTime } from "@/lib/utils";

const TAB_DEFAULTS: Record<string, string> = {
  tab_summary:  "📊 주요 요약",
  tab_news:     "📰 소식 & 이슈",
  tab_playtime: "⏱ 플레이타임",
  tab_global:   "🌍 글로벌 분석",
  tab_qa:       "🙋 AI 질문",
};

interface Props {
  report: AnalysisReport;
  texts?: Record<string, string>;
}

export default function ReportView({ report, texts = {} }: Props) {
  const [activeTab, setActiveTab] = useState("summary");

  // texts 값에 이미 이모지가 포함될 수 있으므로 그대로 사용, 없으면 이모지 포함 기본값 사용
  const TABS = [
    { id: "summary",  label: texts.tab_summary  ?? TAB_DEFAULTS.tab_summary  },
    { id: "news",     label: texts.tab_news     ?? TAB_DEFAULTS.tab_news     },
    { id: "playtime", label: texts.tab_playtime ?? TAB_DEFAULTS.tab_playtime },
    { id: "global",   label: texts.tab_global   ?? TAB_DEFAULTS.tab_global   },
    { id: "qa",       label: texts.tab_qa       ?? TAB_DEFAULTS.tab_qa       },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Game Header Card */}
      <div className="card overflow-hidden mb-5">
        {/* 헤더 이미지 — 스팀 원본 비율(460×215, ~2:1)에 맞춰 반응형 높이 적용 */}
        <div className="relative h-40 sm:h-52 md:h-60">
          {report.header_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.header_image}
              alt={report.game_name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-slate-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-white text-xl font-bold leading-snug">{report.game_name}</h1>
              {/* App ID 대신 출시일 표시 */}
              {report.release_date && (
                <p className="text-white/50 text-xs mt-0.5">
                  출시: {formatDate(report.release_date)}
                </p>
              )}
            </div>
            <HeaderBadge value={report.store_stats.all_desc} />
          </div>
        </div>

        {/* AI one-liner */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-start gap-3">
          <span className="text-lg flex-shrink-0 leading-none mt-0.5">💬</span>
          <p className="text-sm text-slate-700 leading-relaxed italic">
            &ldquo;{report.ai_data.critic_one_liner}&rdquo;
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400">분석 시각: {formatDateTime(report.analysis_time)}</p>
      </div>

      {/* Tabs — overflow-x-auto로 모바일 스크롤 대응 */}
      <div className="flex border-b border-slate-200 mb-6 gap-0.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex-shrink-0 ${
              activeTab === tab.id
                ? "border-slate-800 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "summary" && (
          <SummaryTab
            insights={report.ai_data}
            storeStats={report.store_stats}
            recentLabel={report.recent_label}
            smartReason={report.smart_reason}
          />
        )}
        {activeTab === "news" && (
          <NewsTab insights={report.ai_data} newsData={report.news_data} />
        )}
        {activeTab === "playtime" && (
          <PlaytimeTab insights={report.ai_data} storeStats={report.store_stats} />
        )}
        {activeTab === "global" && (
          <GlobalTab insights={report.ai_data} storeStats={report.store_stats} />
        )}
        {activeTab === "qa" && (
          <QASection
            uuid={report.uuid}
            initialQA={report.qa_history}
            placeholder={texts.report_qa_placeholder}
            btnLabel={texts.report_qa_btn}
          />
        )}
      </div>
    </div>
  );
}
