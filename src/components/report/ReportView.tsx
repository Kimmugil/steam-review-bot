"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/types";
import SentimentBadge from "./SentimentBadge";
import SummaryTab from "./SummaryTab";
import NewsTab from "./NewsTab";
import PlaytimeTab from "./PlaytimeTab";
import GlobalTab from "./GlobalTab";
import QASection from "./QASection";
import { formatDateTime } from "@/lib/utils";
import { ExternalLink, Share2 } from "lucide-react";

const TABS = [
  { id: "summary", label: "주요 요약" },
  { id: "news", label: "소식 & 이슈" },
  { id: "playtime", label: "플레이타임" },
  { id: "global", label: "글로벌 분석" },
  { id: "qa", label: "AI 질문" },
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Game Header Card */}
      <div className="card overflow-hidden mb-5">
        <div className="relative h-44">
          {report.header_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={report.header_image} alt={report.game_name} className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between">
            <div>
              <h1 className="text-white text-xl font-bold leading-snug">{report.game_name}</h1>
              <p className="text-white/50 text-xs mt-0.5">App ID {report.app_id}</p>
            </div>
            <SentimentBadge value={report.store_stats.all_desc} />
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
        <p className="text-xs text-slate-400">분석 {formatDateTime(report.analysis_time)}</p>
        <div className="flex items-center gap-2">
          {report.notion_published && report.notion_url ? (
            <a href={report.notion_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-violet-600 font-medium hover:text-violet-700">
              <ExternalLink className="w-3.5 h-3.5" />노션에서 보기
            </a>
          ) : (
            <button onClick={handlePublish} disabled={publishing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition font-medium">
              <Share2 className="w-3.5 h-3.5" />
              {publishing ? "발행 중..." : "노션으로 발행"}
            </button>
          )}
        </div>
      </div>
      {publishError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mb-4">{publishError}</p>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-slate-800 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "summary" && (
          <SummaryTab insights={report.ai_data} storeStats={report.store_stats} recentLabel={report.recent_label} smartReason={report.smart_reason} />
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
