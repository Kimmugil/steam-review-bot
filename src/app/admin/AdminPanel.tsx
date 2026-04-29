"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReportIndex } from "@/lib/types";
import { formatDateTime, sentimentClass } from "@/lib/utils";

type AdminReport = ReportIndex & { hidden?: boolean };

function authHeader(pw: string) {
  return { Authorization: `Bearer ${pw}` };
}

// ── 로그인 화면 ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw,      setPw]      = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!pw.trim() || loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "인증 실패"); }
      sessionStorage.setItem("admin_password", pw);
      onLogin(pw);
    } catch (e) { setError(e instanceof Error ? e.message : "인증 오류"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div
        className="w-full max-w-xs p-8 space-y-5"
        style={{ background: "#FFFFFF", border: "2px solid #1A1A1A", borderRadius: 20 }}
      >
        <div className="text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="font-black text-lg" style={{ color: "#1A1A1A" }}>관리자 패널</h1>
          <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>비밀번호를 입력하세요</p>
        </div>
        <div className="neo-input-wrap">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="관리자 비밀번호"
            autoFocus
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "#1A1A1A" }}
          />
        </div>
        {error && (
          <p className="text-xs px-3 py-2 rounded-xl"
            style={{ background: "#FFF5F5", border: "2px solid #FF6B6B", color: "#C0392B" }}>
            {error}
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !pw.trim()}
          className="neo-button w-full py-2.5 text-sm"
          style={{ background: "#FFD600", color: "#1A1A1A" }}
        >
          {loading ? "확인 중..." : "로그인"}
        </button>
      </div>
    </div>
  );
}

// ── 삭제 확인 모달 ────────────────────────────────────────────────────────
function DeleteModal({ gameName, onConfirm, onCancel }: {
  gameName: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div
        className="w-full max-w-sm p-6 space-y-4"
        style={{ background: "#FFFFFF", border: "2px solid #1A1A1A", borderRadius: 20 }}
      >
        <div className="text-center">
          <div className="text-3xl mb-2">🗑️</div>
          <h2 className="font-black text-base" style={{ color: "#1A1A1A" }}>리포트 삭제</h2>
          <p className="text-sm mt-1" style={{ color: "#4A4A4A" }}>
            <strong style={{ color: "#1A1A1A" }}>{gameName}</strong>을(를) 인덱스에서
            삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="neo-button flex-1 py-2 text-sm"
            style={{ background: "#F0EFEC", color: "#1A1A1A" }}
          >취소</button>
          <button
            onClick={onConfirm}
            className="neo-button flex-1 py-2 text-sm"
            style={{ background: "#FF6B6B", color: "#1A1A1A" }}
          >삭제</button>
        </div>
      </div>
    </div>
  );
}

// ── 리포트 목록 ───────────────────────────────────────────────────────────
function ReportList({ password }: { password: string }) {
  const [reports,      setReports]      = useState<AdminReport[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReport | null>(null);
  const [filter,       setFilter]       = useState<"all" | "visible" | "hidden">("all");
  const [backfilling,  setBackfilling]  = useState(false);
  const [backfillMsg,  setBackfillMsg]  = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/reports", { headers: authHeader(password) });
      if (!res.ok) throw new Error("리포트 목록을 불러오지 못했습니다.");
      setReports(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "오류 발생"); }
    finally { setLoading(false); }
  }, [password]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const toggleHidden = async (report: AdminReport) => {
    setActionLoading(report.uuid);
    try {
      const res = await fetch(`/api/admin/reports/${report.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader(password) },
        body: JSON.stringify({ hidden: !report.hidden }),
      });
      if (!res.ok) throw new Error("처리 실패");
      setReports(prev => prev.map(r => r.uuid === report.uuid ? { ...r, hidden: !r.hidden } : r));
    } catch { alert("처리 중 오류가 발생했습니다."); }
    finally { setActionLoading(null); }
  };

  const runBackfill = async () => {
    if (backfilling) return;
    setBackfilling(true); setBackfillMsg(null);
    try {
      const res = await fetch("/api/admin/backfill-oneliner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "실패");
      setBackfillMsg(`✅ 완료! 업데이트: ${d.updated}건, 스킵: ${d.skipped}건`);
      fetchReports(); // 목록 새로고침
    } catch (e) {
      setBackfillMsg(`❌ ${e instanceof Error ? e.message : "오류"}`);
    } finally { setBackfilling(false); }
  };

  const deleteReport = async (report: AdminReport) => {
    setDeleteTarget(null); setActionLoading(report.uuid);
    try {
      const res = await fetch(`/api/admin/reports/${report.uuid}`, {
        method: "DELETE", headers: authHeader(password),
      });
      if (!res.ok) throw new Error("삭제 실패");
      setReports(prev => prev.filter(r => r.uuid !== report.uuid));
    } catch { alert("삭제 중 오류가 발생했습니다."); }
    finally { setActionLoading(null); }
  };

  const filtered = reports.filter(r =>
    filter === "visible" ? !r.hidden :
    filter === "hidden"  ?  r.hidden : true
  );
  const visibleCount = reports.filter(r => !r.hidden).length;
  const hiddenCount  = reports.filter(r =>  r.hidden).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-black" style={{ fontSize: 24, color: "#1A1A1A" }}>🛠️ 관리자 패널</h1>
          <p className="text-sm mt-1" style={{ color: "#4A4A4A" }}>리포트 공개 여부를 관리합니다</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="neo-button px-4 py-2 text-sm"
              style={{ background: "#FFD600", color: "#1A1A1A" }}
            >{backfilling ? "처리 중..." : "✍️ 한줄평 채우기"}</button>
            <button
              onClick={fetchReports}
              className="neo-button px-4 py-2 text-sm"
              style={{ background: "#F0EFEC", color: "#1A1A1A" }}
            >🔄 새로고침</button>
          </div>
          {backfillMsg && (
            <p className="text-xs font-bold" style={{ color: backfillMsg.startsWith("✅") ? "#059669" : "#DC2626" }}>
              {backfillMsg}
            </p>
          )}
        </div>
      </div>

      {/* 통계 카드 3열 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "전체",  value: reports.length, bg: "#F0EFEC" },
          { label: "공개",  value: visibleCount,   bg: "#56D0A0" },
          { label: "숨김",  value: hiddenCount,    bg: "#FF6B6B" },
        ].map(s => (
          <div key={s.label} className="p-4 text-center"
            style={{ background: s.bg, border: "2px solid #1A1A1A", borderRadius: 16 }}>
            <p className="font-black text-2xl" style={{ color: "#1A1A1A" }}>{s.value}</p>
            <p className="text-xs font-bold mt-0.5" style={{ color: "#1A1A1A", opacity: 0.6 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-1" style={{ borderBottom: "2px solid #1A1A1A" }}>
        {(["all", "visible", "hidden"] as const).map(f => {
          const labels = { all: "전체", visible: "공개", hidden: "숨김" };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 text-sm font-black transition-colors"
              style={{
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: filter === f ? "3px solid #1A1A1A" : "3px solid transparent",
                marginBottom: -2,
                color: filter === f ? "#1A1A1A" : "#9CA3AF",
                background: "none",
                cursor: "pointer",
              } as React.CSSProperties}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* 리스트 */}
      {loading ? (
        <div className="text-center py-16" style={{ color: "#9CA3AF" }}>
          <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mb-3"
            style={{ borderColor: "#1A1A1A", borderTopColor: "transparent" }} />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-sm" style={{ color: "#DC2626" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>리포트가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(report => (
            <div
              key={report.uuid}
              className="flex items-center gap-4 p-4"
              style={{
                background: "#FFFFFF",
                border: "2px solid #1A1A1A",
                borderRadius: 16,
                opacity: report.hidden ? 0.6 : 1,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={`/report/${report.uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-black text-sm hover:opacity-70 transition-opacity truncate"
                    style={{ color: "#1A1A1A", textDecoration: "none" }}
                  >
                    {report.game_name}
                  </a>
                  {report.hidden && (
                    <span className="text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: "#FF6B6B", border: "2px solid #1A1A1A", color: "#1A1A1A" }}>
                      숨김
                    </span>
                  )}
                  <span className={sentimentClass(report.all_desc)}>{report.all_desc}</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                  {formatDateTime(report.analysis_time)}
                  {report.all_total > 0 && ` · 리뷰 ${report.all_total.toLocaleString()}개`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleHidden(report)}
                  disabled={actionLoading === report.uuid}
                  className="neo-button px-3 py-1.5 text-xs"
                  style={{
                    background: report.hidden ? "#56D0A0" : "#F0EFEC",
                    color: "#1A1A1A",
                  }}
                >
                  {actionLoading === report.uuid ? "..." : report.hidden ? "👁 표시" : "🚫 숨기기"}
                </button>
                <button
                  onClick={() => setDeleteTarget(report)}
                  disabled={actionLoading === report.uuid}
                  className="neo-button px-3 py-1.5 text-xs"
                  style={{ background: "#FF6B6B", color: "#1A1A1A" }}
                >
                  🗑 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          gameName={deleteTarget.game_name}
          onConfirm={() => deleteReport(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [password, setPassword] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null
  );
  if (!password) return <LoginScreen onLogin={setPassword} />;
  return <ReportList password={password} />;
}
