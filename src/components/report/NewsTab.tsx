"use client";

import type { AiInsights, NewsData } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface Props {
  insights: AiInsights;
  newsData: NewsData;
}

export default function NewsTab({ insights, newsData }: Props) {
  return (
    <div className="space-y-5">

      {/* 최신 소식 */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <p className="section-label">📢 최신 소식</p>
        </div>
        {newsData.title ? (
          <>
            {newsData.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={newsData.image_url}
                alt="뉴스 이미지"
                className="w-full object-cover"
                style={{ height: 180, borderTop: "2px solid #1A1A1A", borderBottom: "2px solid #1A1A1A" }}
              />
            )}
            <div className="p-5">
              <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>{newsData.date}</p>
              {newsData.url ? (
                <a
                  href={newsData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black text-sm mb-4 flex items-start gap-1.5 hover:opacity-70 transition-opacity"
                  style={{ color: "#1A1A1A", textDecoration: "none" }}
                >
                  {newsData.title}
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#9CA3AF", opacity: 0.6 }} />
                </a>
              ) : (
                <p className="font-black text-sm mb-4" style={{ color: "#1A1A1A" }}>{newsData.title}</p>
              )}
              {insights.news_summary?.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: "#9CA3AF" }}>AI 요약</p>
                  <ul className="space-y-1.5">
                    {insights.news_summary.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#1A1A1A" }}>
                        <span className="flex-shrink-0 mt-0.5" style={{ color: "#9CA3AF" }}>•</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="px-5 pb-5 text-sm" style={{ color: "#9CA3AF" }}>관련 소식이 없습니다.</p>
        )}
      </div>

      {/* 주요 이슈 픽 */}
      <div className="card p-5">
        <p className="section-label">🚨 주요 이슈 픽</p>
        <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
          최신 동향 추출 기간 내 리뷰를 중심으로 도출한 핵심 체크포인트입니다.
        </p>
        {insights.ai_issue_pick?.length > 0 ? (
          <div className="space-y-3">
            {insights.ai_issue_pick.map((issue, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 rounded-xl"
                style={{ background: "#FAFAFA", border: "2px solid #E2E8F0" }}
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black mt-0.5"
                  style={{ background: "#FF6B6B", border: "2px solid #1A1A1A", color: "#1A1A1A" }}
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: "#1A1A1A" }}>{issue}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#9CA3AF" }}>유의미한 이슈가 발견되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}
