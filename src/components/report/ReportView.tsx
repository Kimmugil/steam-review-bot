"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/types";
import SentimentBadge from "./SentimentBadge";
import SummaryTab from "./SummaryTab";
import NewsTab from "./NewsTab";
import PlaytimeTab from "./PlaytimeTab";
import GlobalTab from "./GlobalTab";
import QASection from "./QASection";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ExternalLink, Share2 } from "lucide-react";

const TABS = [
  { id: "summary", label: "📊 주요 요약" },
  { id: "news", label: "📰 소식 & 이슈" },
  { id: "playtime", label: "⏱ 플레이타임" },
  { id: "global", label: "🌍 글로벌 분석" },
  { id: "qa", label: "🙋 AI 질문" },
];

interface Props {
  report: AnalysisReport;
}

export default function ReportView({ report: initialReport }: Props) {
  const [activeTab, setActiveTab] = useState("summary");
  const [report, setReport] = useState(initialReport);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublish = async () => {
    if (publishing || report.notion_published) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/publish/${report.uuid}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발행 실패");
      setReport({ ...report, notion_published: true, notion_url: data.notion_url });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Game Header */}
      <div className="card overflow-hidden mb-6">
        <div className="relative">
          {report.header_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.header_image}
              alt={report.game_name}
              className="w-full h-48 object-cover"
            />
          )}
          <div className={`absolute inset-0 ${report.header_image ? "bg-gradient-to-t from-black/70 via-black/30 to-transparent" : "bg-slate-800"}`} />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-white/60 text-xs mb-1">출시일 {formatDate(report.release_date)}</p>
                <h1 className="text-white text-2xl font-bold leading-tight">{report.game_name}</h1>
              </div>
              <div className="flex items-center gap-2">
                <SentimentBadge value={report.store_stats.all_desc} />
              </div>
            </div>
          </div>
        </div>
        {/* AI One-liner */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">💬</span>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">AI 한줄평</p>
            <p className="text-sm font-medium text-slate-800 italic leading-relaxed">
              &ldquo;{report.ai_data.critic_one_liner}&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Publish / Notion */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-slate-400">분석 시각: {formatDateTime(report.analysis_time)}</p>
        <div className="flex items-center gap-2">
          {report.notion_published && report.notion_url ? (
            <a
              href={report.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              노션에서 보기
            </a>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition font-medium"
            >
              <Share2 className="w-4 h-4" />
              {publishing ? "발행 중..." : "📤 노션으로 발행"}
            </button>
          )}
        </div>
      </div>
      {publishError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mb-4">{publishError}</p>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
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
          <QASection uuid={report.uuid} initialQA={report.qa_history} />
        )}
      </div>
    </div>
  );
}
