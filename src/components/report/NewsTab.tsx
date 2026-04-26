"use client";

import type { AiInsights, NewsData } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface Props {
  insights: AiInsights;
  newsData: NewsData;
}

export default function NewsTab({ insights, newsData }: Props) {
  return (
    <div className="space-y-6">
      {/* Latest News */}
      <div>
        <h3 className="section-heading">📢 최신 소식</h3>
        {newsData.title ? (
          <div className="card overflow-hidden">
            {newsData.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={newsData.image_url} alt="뉴스 이미지" className="w-full h-40 object-cover" />
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">{newsData.date}</p>
                  {newsData.url ? (
                    <a href={newsData.url} target="_blank" rel="noopener noreferrer"
                      className="font-semibold text-slate-800 hover:text-slate-600 flex items-start gap-1.5">
                      {newsData.title}
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                    </a>
                  ) : (
                    <p className="font-semibold text-slate-800">{newsData.title}</p>
                  )}
                </div>
              </div>
              {insights.news_summary?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">AI 요약</p>
                  <ul className="space-y-2">
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
          </div>
        ) : (
          <div className="card p-5 text-sm text-slate-400 text-center">관련 소식이 없습니다.</div>
        )}
      </div>

      {/* Issue Pick */}
      <div>
        <h3 className="section-heading">🚨 주요 이슈 픽</h3>
        <p className="text-xs text-slate-400 mb-3">
          💡 최신 동향 추출 기간 내 작성된 리뷰를 중심으로 도출된 핵심 체크포인트입니다.
        </p>
        {insights.ai_issue_pick?.length > 0 ? (
          <div className="space-y-3">
            {insights.ai_issue_pick.map((issue, i) => (
              <div key={i} className="card p-4 flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed">{issue}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-5 bg-slate-50">
            <p className="text-sm text-slate-400 text-center">
              ℹ️ 데이터가 부족하거나 유의미한 주요 이슈가 발견되지 않았습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
