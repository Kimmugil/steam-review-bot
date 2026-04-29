"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { extractAppId, formatDateTime, formatDate, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";

type QueueItem = {
  appId: string;
  gameName: string;
  uuid: string;
  status: string;
  timestamp: string;
};

type GamePreview = {
  appId: string;
  gameName: string;
  headerImage: string;
  releaseDate: string;
};

const QUEUE_STEP_LABELS: Record<string, string> = {
  PENDING:        "대기 중",
  GAME_INFO:      "게임 정보 확인 중...",
  STATS_START:    "통계 수집 중...",
  REVIEWS_START:  "리뷰 수집 중...",
  AI_START:       "AI 분석 중...",
  SAVING:         "리포트 저장 중...",
};

export default function HomePage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [preview, setPreview] = useState<GamePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [recentReports, setRecentReports] = useState<ReportIndex[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [t, setT] = useState<Record<string, string>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = async () => {
    try {
      const [reportsRes, queueRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/queue"),
      ]);
      if (reportsRes.ok) setRecentReports((await reportsRes.json()).slice(0, 8));
      if (queueRes.ok) setQueue(await queueRes.json());
    } catch {
      // Ignore poll errors
    }
  };

  useEffect(() => {
    fetch("/api/ui-texts").then(r => r.ok ? r.json() : {}).then(setT).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 입력값 변화 시 게임 프리뷰 debounce 조회
  useEffect(() => {
    const appId = extractAppId(input);
    if (!appId) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    setPreviewError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/preview?appId=${appId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "게임을 찾을 수 없습니다.");
        setPreview(data);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "게임을 찾을 수 없습니다.");
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
  }, [input]);

  const startAnalysis = async () => {
    const appId = extractAppId(input);
    if (!appId) {
      setError("유효한 App ID 또는 스팀 상점 주소를 입력해 주세요.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/analyze/steam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "대기열 등록에 실패했습니다.");
      setInput("");
      setPreview(null);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">

      {/* Hero — tractor 이미지 + 설명 */}
      <div className="flex flex-col sm:flex-row items-center gap-8 mb-12">
        <div className="flex-shrink-0">
          <Image
            src="/tractor.png"
            alt="스팀 리뷰 탈곡기"
            width={140}
            height={140}
            className="rounded-2xl object-contain"
            priority
          />
        </div>
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {t.app_title ?? "스팀 리뷰 탈곡기"}
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            {t.home_hero_desc ?? "스팀 상점 주소나 App ID를 입력하면, 유저 리뷰를 탈탈 털어 글로벌 민심을 분석해 드립니다."}
          </p>
        </div>
      </div>

      {/* 입력 카드 */}
      <div className="card p-6 mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && !submitting && startAnalysis()}
            placeholder={t.home_input_placeholder ?? "예: https://store.steampowered.com/app/2215430"}
            disabled={submitting}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400 transition"
          />
          <button
            onClick={startAnalysis}
            disabled={submitting || !input.trim()}
            className="px-5 py-3 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            {submitting ? "등록 중..." : (t.home_analyze_btn ?? "🚜 탈곡 시작")}
          </button>
        </div>

        {/* 게임 프리뷰 */}
        {previewLoading && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            게임 정보 확인 중...
          </div>
        )}
        {preview && !previewLoading && (
          <div className="mt-4 flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            {preview.headerImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.headerImage} alt={preview.gameName} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{preview.gameName}</p>
              <p className="text-xs text-slate-400 mt-0.5">출시일: {formatDate(preview.releaseDate)}</p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">✓ 이 게임이 맞나요?</p>
            </div>
          </div>
        )}
        {previewError && !previewLoading && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ {previewError}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
        {submitted && (
          <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
            ✅ 대기열에 등록됐습니다. 잠시 후 아래 목록에서 진행 상황을 확인하세요.
          </p>
        )}
      </div>

      {/* 대기열 */}
      {queue.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-slate-500">
              {t.home_queue_title ?? "분석 진행 중"}
            </h2>
          </div>
          <div className="space-y-2">
            {queue.map((q) => {
              const stepLabel = QUEUE_STEP_LABELS[q.status] ?? "처리 중...";
              return (
                <div key={q.uuid} className="card p-4 bg-amber-50/60 border-amber-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                        {q.gameName || `App ID: ${q.appId}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">요청: {formatDateTime(q.timestamp)}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full whitespace-nowrap">
                        {stepLabel}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">{t.home_queue_wait ?? "약 1~3분 소요"}</p>
                    </div>
                  </div>
                  {/* 진행 표시줄 */}
                  <div className="mt-3 h-1 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 최근 완료 리포트 */}
      {recentReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500">
              {t.home_recent_title ?? "최근 완료된 리포트"}
            </h2>
            <a href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              {t.home_view_all ?? "전체 보기 →"}
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

      {/* 리포트도 대기열도 없는 첫 방문 상태 */}
      {recentReports.length === 0 && queue.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm">아직 분석된 게임이 없습니다.</p>
          <p className="text-xs mt-1">위에서 스팀 게임 주소를 입력해 첫 탈곡을 시작해 보세요 🌾</p>
        </div>
      )}
    </div>
  );
}
