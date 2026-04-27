"use client";

import { useState, useEffect } from "react";
import { extractAppId, formatDateTime, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";

type QueueItem = {
  appId: string;
  gameName: string;
  uuid: string;
  status: string;
  timestamp: string;
};

export default function HomePage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [recentReports, setRecentReports] = useState<ReportIndex[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const fetchData = async () => {
    try {
      const [reportsRes, queueRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/queue")
      ]);
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setRecentReports(data.slice(0, 8));
      }
      if (queueRes.ok) {
        const qData = await queueRes.json();
        setQueue(qData);
      }
    } catch (e) {
      // Ignore poll errors
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const startAnalysis = async () => {
    const appId = extractAppId(input);
    if (!appId) {
      setError("유효한 App ID 또는 스팀 상점 주소를 입력해 주세요.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const steamRes = await fetch("/api/analyze/steam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const steamData = await steamRes.json();
      if (!steamRes.ok) {
        throw new Error(steamData.error ?? "대기열 등록에 실패했습니다.");
      }

      setInput(""); // Clear input on success
      fetchData(); // Immediately refresh to show in queue
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 text-4xl mb-6">
          🌾
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">스팀 리뷰 탈곡기</h1>
        <p className="text-slate-500 text-base leading-relaxed max-w-md mx-auto">
          스팀 상점 주소나 App ID를 입력하면,<br />
          유저 리뷰를 탈탈 털어 글로벌 민심을 확인할 수 있습니다.
        </p>
      </div>

      {/* 검색 카드 */}
      <div className="card p-6 mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !submitting && startAnalysis()}
            placeholder="예: https://store.steampowered.com/app/2215430"
            disabled={submitting}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400 transition"
          />
          <button
            onClick={startAnalysis}
            disabled={submitting || !input.trim()}
            className="px-5 py-3 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            {submitting ? "등록 중..." : "🚜 탈곡 대기열 등록"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
      </div>

      {/* 대기열 (Queue) */}
      {queue.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              리포트 발행 대기소 (진행 중)
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {queue.map((q) => (
              <div key={q.uuid} className="card p-4 block bg-amber-50/50 border-amber-200">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
                    {q.gameName || `App ID: ${q.appId}`}
                  </p>
                  <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded whitespace-nowrap">
                    진행 중...
                  </span>
                </div>
                <p className="text-xs text-slate-400">요청 시각: {formatDateTime(q.timestamp)}</p>
                <p className="text-xs text-slate-500 mt-2">약 1~3분 소요됩니다.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 분석 기록 */}
      {recentReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              최근 완료된 리포트
            </h2>
            <a href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              전체 보기 →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentReports.map((r) => (
              <a key={r.uuid} href={`/report/${r.uuid}`} className="card-hover p-4 block">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
                    {r.game_name}
                  </p>
                  <span className={sentimentClass(r.all_desc)}>{r.all_desc}</span>
                </div>
                <p className="text-xs text-slate-400">{formatDateTime(r.analysis_time)}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
