"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/types";
import { sentimentClass } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import SummaryTab   from "./SummaryTab";
import NewsTab      from "./NewsTab";
import PlaytimeTab  from "./PlaytimeTab";
import GlobalTab    from "./GlobalTab";

// 감성 뱃지 배경색 (헤더 이미지 위에 올라가는 solid 뱃지)
function sentimentSolidBg(val: string): string {
  if (val.includes("긍정")) return "#D1FAE5";
  if (val.includes("부정")) return "#FEE2E2";
  if (val === "복합적")    return "#FEF9C3";
  return "#F0EFEC";
}

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

  const TABS = [
    { id: "summary",  label: texts.tab_summary  ?? TAB_DEFAULTS.tab_summary  },
    { id: "news",     label: texts.tab_news     ?? TAB_DEFAULTS.tab_news     },
    { id: "playtime", label: texts.tab_playtime ?? TAB_DEFAULTS.tab_playtime },
    { id: "global",   label: texts.tab_global   ?? TAB_DEFAULTS.tab_global   },
  ];

  const badgeBg = sentimentSolidBg(report.store_stats.all_desc);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* ── 게임 헤더 카드 ──────────────────────────────────────────── */}
      <div
        className="overflow-hidden mb-6"
        style={{ border: "2px solid #1A1A1A", borderRadius: 20, background: "#FFFFFF" }}
      >
        {/* 커버 이미지 */}
        <div className="relative" style={{ height: "clamp(140px, 28vw, 240px)" }}>
          {report.header_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.header_image}
              alt={report.game_name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: "#F0EFEC" }} />
          )}
          {/* 그라디언트 오버레이 */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }}
          />
          {/* 게임 이름 + 배지 */}
          <div className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="leading-tight"
                style={{ color: "#FFFFFF", fontWeight: 900, fontSize: "clamp(16px, 4vw, 22px)" }}
              >
                {report.game_name}
              </h1>
              {report.release_date && (
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
                  출시: {formatDate(report.release_date)}
                </p>
              )}
            </div>
            {/* 감성 배지 — solid 배경 */}
            <span
              className="flex-shrink-0 font-black text-xs px-3 py-1.5 rounded-full"
              style={{ background: badgeBg, border: "2px solid #1A1A1A", color: "#1A1A1A" }}
            >
              {report.store_stats.all_desc}
            </span>
          </div>
        </div>

        {/* AI 한줄평 */}
        <div
          className="px-5 py-4 flex items-start gap-3"
          style={{ borderTop: "2px solid #1A1A1A" }}
        >
          <span className="text-lg flex-shrink-0 leading-none mt-0.5">💬</span>
          <p className="text-sm leading-relaxed italic" style={{ color: "#4A4A4A" }}>
            &ldquo;{report.ai_data.critic_one_liner}&rdquo;
          </p>
        </div>
      </div>

      {/* ── 메타 정보 + Steam 링크 ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs" style={{ color: "#9CA3AF" }}>
          분석 시각: {formatDateTime(report.analysis_time)}
        </p>
        <a
          href={`https://store.steampowered.com/app/${report.app_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="neo-button px-3 py-1.5 text-xs flex-shrink-0"
          style={{ background: "#1B2838", color: "#FFFFFF", borderColor: "#1B2838" }}
        >
          <ExternalLink size={12} />
          Steam 상점 보기
        </a>
      </div>

      {/* ── 탭 바 ──────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 mb-6 overflow-x-auto no-scrollbar"
        style={{ borderBottom: "2px solid #1A1A1A", paddingBottom: 0 }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-black whitespace-nowrap flex-shrink-0 transition-colors"
            style={{
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === tab.id ? "3px solid #1A1A1A" : "3px solid transparent",
              marginBottom: -2,
              color: activeTab === tab.id ? "#1A1A1A" : "#9CA3AF",
              background: "none",
              cursor: "pointer",
            } as React.CSSProperties}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 탭 콘텐츠 ────────────────────────────────────────────── */}
      <div>
        {activeTab === "summary"  && <SummaryTab insights={report.ai_data} storeStats={report.store_stats} recentLabel={report.recent_label} smartReason={report.smart_reason} />}
        {activeTab === "news"     && <NewsTab insights={report.ai_data} newsData={report.news_data} />}
        {activeTab === "playtime" && <PlaytimeTab insights={report.ai_data} storeStats={report.store_stats} />}
        {activeTab === "global"   && <GlobalTab insights={report.ai_data} storeStats={report.store_stats} />}
      </div>
    </div>
  );
}
