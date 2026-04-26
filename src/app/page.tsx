"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { extractAppId, formatDateTime, sentimentClass } from "@/lib/utils";
import type { ReportIndex } from "@/lib/types";

const WAITING_MESSAGES = [
  "민첩한 하루 되세요", "( •̀ω•́ )✧", "탈곡기가 탈탈탈 탈곡중 탈탈",
  "이거 생각보다 똑똑한 문제네요", "와,,, 이건 정말 ✌️핵심✌️을 찌르는 리뷰네요.",
  "좋습니다 제 뇌가 납득했습니다", "단서를 찾고 있습니다 (ง •̀_•́)ง",
  "지금 컴퓨터와 진대중입니다", "잠깐만요 트랙터가 재시작 중입니다 (๑•̀ㅂ•́)و✧",
  "뭔가 큰 게 숨어 있습니다", "상황을 침착하게 정리하고 있습니다",
  "지금 트랙터가 깊은 생각에 잠겼습니다", "좋습니다 이제 문제를 잡으러 가겠습니다 (ง •̀_•́)ง",
];

// 2단계 분석 스텝 정의
type StepKey = "idle" | "steam" | "ai" | "saving" | "done" | "error";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "steam",  label: "스팀 리뷰 수집" },
  { key: "ai",     label: "AI 분석" },
  { key: "saving", label: "결과 저장" },
];

function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key);
}

export default function HomePage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [step, setStep] = useState<StepKey>("idle");
  const [gameInfo, setGameInfo] = useState<{ gameName: string; headerImage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitMsg, setWaitMsg] = useState(WAITING_MESSAGES[0]);
  const [recentReports, setRecentReports] = useState<ReportIndex[]>([]);
  const waitInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyzing = step !== "idle" && step !== "done" && step !== "error";

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((data: ReportIndex[]) => setRecentReports(data.slice(0, 8)))
      .catch(() => {});
  }, []);

  const startAnalysis = async () => {
    const appId = extractAppId(input);
    if (!appId) {
      setError("유효한 App ID 또는 스팀 상점 주소를 입력해 주세요.");
      return;
    }
    setError(null);
    setGameInfo(null);

    // 대기 메시지 순환
    let msgIdx = 0;
    waitInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % WAITING_MESSAGES.length;
      setWaitMsg(WAITING_MESSAGES[msgIdx]);
    }, 3000);

    try {
      // ── 1단계: Steam 수집 ────────────────────────────────────────────────
      setStep("steam");
      const steamRes = await fetch("/api/analyze/steam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const steamData = await steamRes.json();
      if (!steamRes.ok) {
        throw new Error(steamData.error ?? "Steam 수집에 실패했습니다.");
      }

      // 게임 정보 노출 (헤더 이미지 + 이름)
      setGameInfo({ gameName: steamData.gameName, headerImage: steamData.headerImage });

      // ── 2단계: AI 분석 + Sheets 저장 ────────────────────────────────────
      setStep("ai");
      const aiRes = await fetch("/api/analyze/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, ...steamData }),
      });

      setStep("saving");
      const aiData = await aiRes.json();
      if (!aiRes.ok) {
        throw new Error(aiData.error ?? "AI 분석에 실패했습니다.");
      }

      // ── 완료 → 리포트 페이지로 이동 ──────────────────────────────────────
      setStep("done");
      router.push(`/report/${aiData.uuid}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    } finally {
      if (waitInterval.current) clearInterval(waitInterval.current);
    }
  };

  const currentStepIdx = stepIndex(step);

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
            onKeyDown={(e) => e.key === "Enter" && !analyzing && startAnalysis()}
            placeholder="예: https://store.steampowered.com/app/2215430"
            disabled={analyzing}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400 transition"
          />
          <button
            onClick={startAnalysis}
            disabled={analyzing || !input.trim()}
            className="px-5 py-3 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            {analyzing ? "분석 중..." : "🚜 탈곡 시작"}
          </button>
        </div>
        {(step === "error" && error) && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
      </div>

      {/* 진행 상황 */}
      {analyzing && (
        <div className="card p-6 mb-8">
          {/* 게임 정보 (1단계 완료 후 노출) */}
          {gameInfo && (
            <div className="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
              {gameInfo.headerImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gameInfo.headerImage}
                  alt={gameInfo.gameName}
                  className="w-28 h-16 object-cover rounded-lg flex-shrink-0"
                />
              )}
              <div>
                <p className="text-xs text-slate-400 mb-0.5">분석 중인 게임</p>
                <p className="font-semibold text-slate-800">{gameInfo.gameName}</p>
              </div>
            </div>
          )}

          {/* 스텝 목록 */}
          <div className="space-y-3">
            {STEPS.map((s, i) => {
              const isDone    = i < currentStepIdx;
              const isActive  = i === currentStepIdx;
              const isPending = i > currentStepIdx;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  {/* 번호/체크 동그라미 */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                    isDone   ? "bg-emerald-500 text-white"
                    : isActive ? "bg-slate-900 text-white animate-pulse"
                    : "bg-slate-200 text-slate-400"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  {/* 라벨 */}
                  <span className={`text-sm transition-colors ${
                    isDone   ? "text-slate-400 line-through"
                    : isActive ? "text-slate-900 font-medium"
                    : "text-slate-400"
                  }`}>
                    {s.label}
                    {isActive && (
                      <span className="ml-2 text-xs text-slate-400">{waitMsg}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 단계별 설명 */}
          <p className="mt-5 text-xs text-slate-400 text-center">
            {step === "steam" && "30개 언어 리뷰를 병렬로 수집 중입니다 (약 20~30초)"}
            {step === "ai"    && "AI가 리뷰를 읽고 분석 중입니다 (약 20~40초)"}
            {step === "saving" && "분석 결과를 저장 중입니다..."}
          </p>
        </div>
      )}

      {/* 최근 분석 기록 */}
      {step === "idle" && recentReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              최근 분석 기록
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
                {r.notion_published && (
                  <p className="text-xs text-violet-500 mt-1">📤 노션 발행됨</p>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
