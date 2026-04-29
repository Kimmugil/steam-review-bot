"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReportIndex } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { sentimentClass } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
type AdminReport = ReportIndex & { hidden?: boolean };

// ── Helpers ──────────────────────────────────────────────────────────────────
function authHeader(password: string) {
  return { Authorization: `Bearer ${password}` };
}

// ── Password Screen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!pw.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "인증 실패");
      }
      sessionStorage.setItem("admin_password", pw);
      onLogin(pw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-lg font-bold text-slate-800">관리자 패널</h1>
          <p className="text-xs text-slate-400 mt-1">비밀번호를 입력하세요</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="관리자 비밀번호"
            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 transition"
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !pw.trim()}
            className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({
  gameName,
  onConfirm,
  onCancel,
}: {
  gameName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🗑️</div>
          <h2 className="text-base font-bold text-slate-800">리포트 삭제</h2>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-semibold text-slate-800">{gameName}</span> 리포트를
            인덱스에서 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
function ReportList({ password }: { password: string }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReport | null>(null);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", { headers: authHeader(password) });
      if (!res.ok) throw new Error("리포트 목록을 불러오지 못했습니다.");
      setReports(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
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
      setReports((prev) =>
        prev.map((r) => r.uuid === report.uuid ? { ...r, hidden: !r.hidden } : r)
      );
    } catch {
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteReport = async (report: AdminReport) => {
    setDeleteTarget(null);
    setActionLoading(report.uuid);
    try {
      const res = await fetch(`/api/admin/reports/${report.uuid}`, {
        method: "DELETE",
        headers: authHeader(password),
      });
      if (!res.ok) throw new Error("삭제 실패");
      setReports((prev) => prev.filter((r) => r.uuid !== report.uuid));
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = reports.filter((r) => {
    if (filter === "visible") return !r.hidden;
    if (filter === "hidden") return r.hidden;
    return true;
  });

  const visibleCount = reports.filter((r) => !r.hidden).length;
  const hiddenCount = reports.filter((r) => r.hidden).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🛠️ 관리자 패널</h1>
          <p className="text-sm text-slate-400 mt-1">리포트 공개 여부를 관리합니다</p>
        </div>
        <button
          onClick={fetchReports}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          🔄 새로고침
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "전체", value: reports.length, color: "text-slate-700" },
          { label: "공개", value: visibleCount, color: "text-emerald-600" },
          { label: "숨김", value: hiddenCount, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["all", "visible", "hidden"] as const).map((f) => {
          const labels = { all: "전체", visible: "공개", hidden: "숨김" };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                filter === f
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mb-3" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-red-600 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">리포트가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((report) => (
            <div
              key={report.uuid}
              className={`card p-4 flex items-center gap-4 ${report.hidden ? "opacity-60" : ""}`}
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={`/report/${report.uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sm text-slate-800 hover:text-slate-600 transition truncate"
                  >
                    {report.game_name}
                  </a>
                  {report.hidden && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      숨김
                    </span>
                  )}
                  <span className={`flex-shrink-0 ${sentimentClass(report.all_desc)}`}>
                    {report.all_desc}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatDateTime(report.analysis_time)}
                  {report.all_total > 0 && ` · 리뷰 ${report.all_total.toLocaleString()}개`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleHidden(report)}
                  disabled={actionLoading === report.uuid}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50 ${
                    report.hidden
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {actionLoading === report.uuid ? "..." : report.hidden ? "👁 표시" : "🚫 숨기기"}
                </button>
                <button
                  onClick={() => setDeleteTarget(report)}
                  disabled={actionLoading === report.uuid}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"
                >
                  🗑 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
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

// ── Root export ───────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [password, setPassword] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("admin_password");
    }
    return null;
  });

  if (!password) {
    return <LoginScreen onLogin={setPassword} />;
  }
  return <ReportList password={password} />;
}
