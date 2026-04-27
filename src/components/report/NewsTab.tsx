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
      {/* Latest News */}
      <div className="card overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <p className="section-label">📢 최신 소식</p>
        </div>
        {newsData.title ? (
          <>
            {newsData.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={newsData.image_url} alt="뉴스 이미지" className="w-full h-40 object-cover" />
            )}
            <div className="p-5">
              <p className="text-xs text-slate-400 mb-1">{newsData.date}</p>
              {newsData.url ? (
                <a href={newsData.url} target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-slate-800 hover:text-slate-600 flex items-start gap-1.5 text-sm mb-4">
                  {newsData.title}
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                </a>
              ) : (
                <p className="font-semibold text-slate-800 text-sm mb-4">{newsData.title}</p>
              )}
              {insights.news_summary?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2">AI 요약</p>
                  <ul className="space-y-1.5">
                    {insights.news_summary.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-slate-300 flex-shrink-0 mt-0.5">•</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-400">관련 소식이 없습니다.</p>
        )}
      </div>

      {/* Issue Pick */}
      <div className="card p-5">
        <p className="section-label">🚨 주요 이슈 픽</p>
        <p className="text-xs text-slate-400 mb-4">최신 동향 추출 기간 내 리뷰를 중심으로 도출한 핵심 체크포인트입니다.</p>
        {insights.ai_issue_pick?.length > 0 ? (
          <div className="space-y-3">
            {insights.ai_issue_pick.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed">{issue}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">유의미한 이슈가 발견되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}
