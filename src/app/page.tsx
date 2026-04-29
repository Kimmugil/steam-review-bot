"use client";

import { useState, useEffect, useRef } from "react";
import { extractAppId, formatDateTime, formatDate, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";
import { Search } from "lucide-react";

// 카드 회전값 순환
const CARD_ROTATIONS = [1.2, -1.0, 0.8, -1.5, 1.0, -0.8];

type QueueItem = {
  appId: string; gameName: string; uuid: string; status: string; timestamp: string;
};
type GamePreview = {
  appId: string; gameName: string; headerImage: string; releaseDate: string;
};

// Steam CDN 썸네일 URL
function steamThumb(appId: string) {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

// ── 회전 리포트 카드 ────────────────────────────────────────────────────────
function ReportCard({ r, rotation }: { r: ReportIndex; rotation: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={`/report/${r.uuid}`}
      className="block overflow-hidden transition-all duration-200"
      style={{
        background: "#FFFFFF",
        border: "2px solid #1A1A1A",
        borderRadius: 16,
        boxShadow: hovered ? "4px 4px 0px 0px #1A1A1A" : "2px 2px 0px 0px #1A1A1A",
        transform: `rotate(${hovered ? 0 : rotation}deg) ${hovered ? "translate(-1px,-1px)" : ""}`,
        textDecoration: "none",
        cursor: "pointer",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 썸네일 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={steamThumb(r.app_id)}
        alt={r.game_name}
        className="w-full object-cover"
        style={{ height: 90, borderBottom: "2px solid #1A1A1A", display: "block" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      <div className="p-3">
        {/* 게임명 + 배지 */}
        <p className="font-black text-sm leading-tight line-clamp-2 mb-1.5" style={{ color: "#1A1A1A" }}>
          {r.game_name}
        </p>
        <span className={sentimentClass(r.all_desc)}>{r.all_desc}</span>
        {/* AI 한줄평 */}
        {r.one_liner && (
          <p className="text-xs mt-2 leading-snug line-clamp-2 italic" style={{ color: "#4A4A4A" }}>
            &ldquo;{r.one_liner}&rdquo;
          </p>
        )}
        <p className="text-xs mt-2" style={{ color: "#9CA3AF" }}>{formatDateTime(r.analysis_time)}</p>
      </div>
    </a>
  );
}

// ── 메인 ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  const [preview, setPreview]           = useState<GamePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [recentReports, setRecentReports] = useState<ReportIndex[]>([]);
  const [queue, setQueue]               = useState<QueueItem[]>([]);
  const [t, setT]                       = useState<Record<string, string>>({});

  // 롤링 텍스트
  const [rollingIdx,  setRollingIdx]  = useState(0);
  const [rollingAnim, setRollingAnim] = useState<"enter" | "exit" | "idle">("idle");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 큐 스텝 라벨 ───────────────────────────────────────────────────────
  const queueStepLabel = (status: string): string => {
    const map: Record<string, string> = {
      PENDING:       t.queue_step_pending   ?? "대기 중",
      GAME_INFO:     t.queue_step_game_info ?? "게임 정보 확인 중...",
      STATS_START:   t.queue_step_stats     ?? "통계 수집 중...",
      REVIEWS_START: t.queue_step_reviews   ?? "리뷰 수집 중...",
      AI_START:      t.queue_step_ai        ?? "AI 분석 중...",
      SAVING:        t.queue_step_saving    ?? "리포트 저장 중...",
    };
    return map[status] ?? (t.queue_step_default ?? "처리 중...");
  };

  // ── 데이터 폴링 ────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [reportsRes, queueRes] = await Promise.all([
        fetch("/api/reports"), fetch("/api/queue"),
      ]);
      if (reportsRes.ok) setRecentReports((await reportsRes.json()).slice(0, 6));
      if (queueRes.ok)   setQueue(await queueRes.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch("/api/ui-texts").then(r => r.ok ? r.json() : {}).then(setT).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── 롤링 텍스트 순환 ──────────────────────────────────────────────────
  useEffect(() => {
    if (recentReports.length < 2) return;
    const timer = setInterval(() => {
      setRollingAnim("exit");
      setTimeout(() => {
        setRollingIdx(i => (i + 1) % recentReports.length);
        setRollingAnim("enter");
        setTimeout(() => setRollingAnim("idle"), 350);
      }, 250);
    }, 3200);
    return () => clearInterval(timer);
  }, [recentReports]);

  // ── 게임 프리뷰 debounce ──────────────────────────────────────────────
  useEffect(() => {
    const appId = extractAppId(input);
    if (!appId) {
      setPreview(null); setPreviewError(null); setPreviewLoading(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    setPreviewLoading(true); setPreview(null); setPreviewError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/preview?appId=${appId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? (t.error_game_not_found ?? "게임을 찾을 수 없습니다."));
        setPreview(data);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : (t.error_game_not_found ?? "게임을 찾을 수 없습니다."));
      } finally { setPreviewLoading(false); }
    }, 600);
  }, [input, t]);

  // ── 분석 시작 ────────────────────────────────────────────────────────
  const startAnalysis = async () => {
    const appId = extractAppId(input);
    if (!appId) {
      setError(t.error_invalid_input ?? "유효한 App ID 또는 스팀 상점 주소를 입력해 주세요.");
      return;
    }
    setError(null); setSubmitting(true);
    try {
      const res  = await fetch("/api/analyze/steam", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? (t.error_queue_register_failed ?? "대기열 등록에 실패했습니다."));
      setInput(""); setPreview(null); setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  const pendingQueue = queue.filter(q => q.status === "PENDING" || q.status.includes("_START") || q.status === "GAME_INFO" || q.status === "SAVING");

  return (
    <div className="max-w-3xl mx-auto px-4">

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <div className="pt-16 pb-12 text-center">
        {/* 타이틀 */}
        <h1
          className="mb-4 leading-tight"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)", fontWeight: 900, color: "#1A1A1A" }}
        >
          스팀 리뷰를{" "}
          <span
            className="inline-block"
            style={{ backgroundColor: "#FFD600", padding: "0 6px", borderRadius: 4 }}
          >
            탈곡
          </span>
          해 드립니다
        </h1>

        {/* 롤링 텍스트 */}
        <div
          className="relative overflow-hidden mx-auto mb-6"
          style={{ height: 24, maxWidth: 400 }}
        >
          {recentReports.length > 0 ? (
            <p
              key={rollingIdx}
              className={`absolute inset-x-0 text-center text-sm ${
                rollingAnim === "enter" ? "rolling-enter" :
                rollingAnim === "exit"  ? "rolling-exit"  : ""
              }`}
              style={{ color: "#4A4A4A" }}
            >
              최근 분석: <strong style={{ color: "#1A1A1A" }}>{recentReports[rollingIdx]?.game_name}</strong>
            </p>
          ) : (
            <p className="absolute inset-x-0 text-center text-sm" style={{ color: "#9CA3AF" }}>
              {t.home_hero_desc ?? "스팀 게임 주소를 입력하면 민심을 탈탈 털어 드립니다"}
            </p>
          )}
        </div>

        {/* 입력창 */}
        <div className="neo-input-wrap max-w-xl mx-auto">
          <Search className="flex-shrink-0 ml-2" size={18} style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && !submitting && startAnalysis()}
            placeholder={t.home_input_placeholder ?? "예: https://store.steampowered.com/app/2215430"}
            disabled={submitting}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "#1A1A1A", minWidth: 0 }}
          />
          <button
            onClick={startAnalysis}
            disabled={submitting || !input.trim()}
            className="neo-button flex-shrink-0 px-5 py-2 text-sm"
            style={{ backgroundColor: "#FFD600", color: "#1A1A1A" }}
          >
            {submitting ? (t.home_btn_submitting ?? "등록 중...") : (t.home_analyze_btn ?? "🚜 탈곡 시작")}
          </button>
        </div>

        {/* 게임 프리뷰 */}
        {previewLoading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
            <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent border-current animate-spin" />
            {t.home_preview_loading ?? "게임 정보 확인 중..."}
          </div>
        )}
        {preview && !previewLoading && (
          <div
            className="mt-4 flex items-center gap-4 p-3 mx-auto max-w-xl"
            style={{ background: "#FFFDE7", border: "2px solid #1A1A1A", borderRadius: 16 }}
          >
            {preview.headerImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.headerImage} alt={preview.gameName}
                className="w-20 h-12 object-cover flex-shrink-0"
                style={{ borderRadius: 8, border: "2px solid #1A1A1A" }}
              />
            )}
            <div className="min-w-0 text-left">
              <p className="font-black text-sm leading-tight" style={{ color: "#1A1A1A" }}>{preview.gameName}</p>
              <p className="text-xs mt-0.5" style={{ color: "#4A4A4A" }}>
                {t.home_preview_release_label ?? "출시일:"} {formatDate(preview.releaseDate)}
              </p>
              <p className="text-xs mt-1 font-bold" style={{ color: "#10b981" }}>
                {t.home_preview_confirm ?? "✓ 이 게임이 맞나요?"}
              </p>
            </div>
          </div>
        )}
        {previewError && !previewLoading && (
          <p className="mt-3 text-xs max-w-xl mx-auto px-4 py-2 rounded-xl"
            style={{ background: "#FFF5F5", border: "2px solid #FF6B6B", color: "#C0392B" }}>
            ⚠️ {previewError}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm max-w-xl mx-auto px-4 py-2 rounded-xl"
            style={{ background: "#FFF5F5", border: "2px solid #FF6B6B", color: "#C0392B" }}>
            {error}
          </p>
        )}
        {submitted && (
          <p className="mt-3 text-sm max-w-xl mx-auto px-4 py-2 rounded-xl"
            style={{ background: "#FFFDE7", border: "2px solid #1A1A1A", color: "#1A1A1A" }}>
            {t.home_queue_submitted ?? "✅ 대기열에 등록됐습니다. 잠시 후 아래 목록에서 진행 상황을 확인하세요."}
          </p>
        )}

        <p className="mt-4 text-xs" style={{ color: "#9CA3AF" }}>
          분석에 약 1~3분이 소요됩니다
        </p>
      </div>

      {/* ── 진행 중 배너 ───────────────────────────────────────────── */}
      {pendingQueue.length > 0 && (
        <div className="mb-10 space-y-3">
          {pendingQueue.map((q) => (
            <div
              key={q.uuid}
              className="flex items-center gap-4 px-5 py-4"
              style={{ background: "#FFFDE7", border: "2px solid #1A1A1A", borderRadius: 16 }}
            >
              {/* 진행 스피너 */}
              <span
                className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                style={{ borderColor: "#1A1A1A", borderTopColor: "transparent" }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm truncate" style={{ color: "#1A1A1A" }}>
                  {q.gameName || `App ID: ${q.appId}`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#4A4A4A" }}>
                  {queueStepLabel(q.status)} · {t.queue_requested_label ?? "요청:"} {formatDateTime(q.timestamp)}
                </p>
              </div>
              <span
                className="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0"
                style={{ background: "#FFD600", border: "2px solid #1A1A1A" }}
              >
                {t.home_queue_wait ?? "약 1~3분 소요"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 최근 리포트 ────────────────────────────────────────────── */}
      {recentReports.length > 0 && (
        <div className="pb-16">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-black text-lg" style={{ color: "#1A1A1A" }}>
              {t.home_recent_title ?? "최근 완료된 리포트"}
            </h2>
            <a
              href="/dashboard"
              className="neo-button px-4 py-1.5 text-xs"
              style={{ background: "#F0EFEC", color: "#1A1A1A" }}
            >
              {t.home_view_all ?? "전체 보기 →"}
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {recentReports.map((r, i) => (
              <ReportCard
                key={r.uuid}
                r={r}
                rotation={CARD_ROTATIONS[i % CARD_ROTATIONS.length]}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 빈 상태 ────────────────────────────────────────────────── */}
      {recentReports.length === 0 && queue.length === 0 && (
        <div
          className="text-center py-14 mb-16"
          style={{ border: "2px dashed #E2E8F0", borderRadius: 16 }}
        >
          <p className="text-4xl mb-3">🌾</p>
          <p className="font-black text-base" style={{ color: "#1A1A1A" }}>
            {t.home_empty_state_line1 ?? "아직 분석된 게임이 없습니다."}
          </p>
          <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>
            {t.home_empty_state_line2 ?? "위에서 스팀 게임 주소를 입력해 첫 탈곡을 시작해 보세요 🌾"}
          </p>
        </div>
      )}
    </div>
  );
}
