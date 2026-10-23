"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pill } from "./ui";
import { dateKo } from "@/lib/format";
import type { AdminData } from "@/lib/admin-data";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUS: Record<string, [string, string]> = { done: ["완료", "good"], running: ["진행 중", "cool"], queued: ["대기", "cool"], failed: ["실패", "bad"] };

export default function AdminClient({ data, githubConnected }: { data: AdminData; githubConnected: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [limit, setLimit] = useState(String(data.usage.limit));
  const [cap, setCap] = useState(String(data.ai.cap));
  const [appId, setAppId] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(url: string, body: unknown, ok = "처리했습니다.") {
    setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? (j.message ?? ok) : (j.error ?? j.message ?? "실패했습니다."));
      if (r.ok) router.refresh();
    } finally { setBusy(false); }
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); router.replace("/admin/login"); router.refresh(); }

  const left = Math.max(0, data.usage.limit - data.usage.used);
  const week = data.week as any[];
  return (
    <div className="stack">
      <div className="sec-title" style={{ marginTop: 0 }}>
        <h2>관리자 현황판</h2>
        <span style={{ marginLeft: "auto" }} className="row"><Link href="/admin/texts" className="btn small">화면 문구 관리</Link><button className="btn small" onClick={logout}>로그아웃</button></span>
      </div>
      {msg && <div className="notice" role="status">{msg}</div>}
      {!githubConnected && <div className="notice err">분석 실행기(GitHub)가 연결되지 않았어요. Vercel 환경변수 GITHUB_PAT 를 확인해 주세요. 연결 전에는 새 분석이 시작되지 않아요.</div>}

      <div className="tiles">
        <div className="tile">
          <div className="k">오늘 방문자 분석 요청 (한국 시간)</div>
          <div className="v">{data.usage.used} <span className="muted" style={{ fontSize: 16 }}>/ {data.usage.limit}</span></div>
          <div className="meter"><i style={{ width: `${data.usage.limit ? Math.min(100, (100 * data.usage.used) / data.usage.limit) : 0}%` }} /></div>
          <div className="s">남은 횟수 {left}회 · 자정에 0으로 초기화</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="text" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 80 }} aria-label="하루 분석 한도" />
            <button className="btn small" disabled={busy} onClick={() => call("/api/admin/settings", { key: "daily_limit", value: limit })}>하루 한도 바꾸기</button>
          </div>
        </div>
        <div className="tile">
          <div className="k">이번 달 AI 호출</div>
          <div className="v">{data.ai.used} <span className="muted" style={{ fontSize: 16 }}>/ {data.ai.cap}</span></div>
          <div className="meter"><i style={{ width: `${data.ai.cap ? Math.min(100, (100 * data.ai.used) / data.ai.cap) : 0}%` }} /></div>
          <div className="s">입력 {(data.ai.inputTokens / 1000).toFixed(0)}k · 출력 {(data.ai.outputTokens / 1000).toFixed(0)}k 토큰 · 상한에 닿으면 숫자만 저장</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="text" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} style={{ width: 80 }} aria-label="월 AI 호출 상한" />
            <button className="btn small" disabled={busy} onClick={() => call("/api/admin/settings", { key: "ai_monthly_call_cap", value: cap })}>월 상한 바꾸기</button>
          </div>
        </div>
        <div className="tile"><div className="k">진행 중</div><div className="v">{data.counts.active}</div><div className="s">30분 넘게 멈추면 자동으로 실패 처리</div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn small" disabled={busy} onClick={() => call("/api/admin/analyses", { action: "reap" })}>멈춘 분석 지금 정리</button></div></div>
        <div className="tile"><div className="k">최근 7일 실패</div><div className="v">{data.counts.failed7}</div><div className="s">완료 {data.counts.done}건 · 예전 방식 {data.counts.legacy}건</div></div>
      </div>

      <div className="card">
        <h2>최근 7일 요청</h2>
        <div className="row">{week.length === 0 ? <span className="muted">요청이 없었어요.</span> : week.map((w) => <span key={w.day} className="chip">{String(w.day).slice(5)} <b className="num">{w.count}</b></span>)}</div>
      </div>

      <div className="card">
        <h2>관리자 분석 시작 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 하루 한도를 쓰지 않아요</span></h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = Number(appId.match(/\d{3,9}/)?.[0]); if (n) call("/api/admin/analyses", { action: "rerun", appId: n }); }}>
          <input type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="App ID 또는 스팀 상점 주소" style={{ minWidth: 260 }} />
          <button className="btn primary" disabled={busy || !appId}>분석 시작</button>
        </form>
      </div>

      <div className="card">
        <h2>분석 목록 (최근 200건)</h2>
        <div className="tbl-wrap">
          <table className="gtable">
            <thead><tr><th>게임</th><th>상태</th><th>요청</th><th>방식</th><th>표본</th><th>작업</th></tr></thead>
            <tbody>
              {data.analyses.map((a: any) => {
                const [label, cls] = STATUS[a.status] ?? [a.status, "plain"];
                const active = a.status === "queued" || a.status === "running";
                return (
                  <tr key={a.id}>
                    <td><Link href={`/report/${a.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{a.game_name}</Link>
                      {a.hidden && <span className="badge" style={{ marginLeft: 6 }}>숨김</span>}
                      {a.error && <div className="muted small" style={{ maxWidth: 360 }}>{a.error}</div>}</td>
                    <td><Pill cls={cls}>{label}</Pill>{active && a.step && <div className="muted small">{a.step}</div>}</td>
                    <td className="small">{dateKo(a.requested_at, true)}<div className="muted">{a.requested_via === "web" ? "방문자" : a.requested_via === "admin" ? "관리자" : "예전"}</div></td>
                    <td>{a.method_version === 1 ? <span className="badge legacy">예전 방식</span> : "새 방식"}</td>
                    <td className="num">{a.samples || "-"}</td>
                    <td>
                      <div className="row">
                        {a.status === "done" && <button className="btn small" disabled={busy} onClick={() => call("/api/admin/analyses", { id: a.id, action: a.hidden ? "show" : "hide" })}>{a.hidden ? "보이기" : "숨기기"}</button>}
                        {a.status !== "queued" && a.status !== "running" && <button className="btn small" disabled={busy} onClick={() => call("/api/admin/analyses", { action: "rerun", appId: Number(a.app_id) })}>다시 분석</button>}
                        {active && <button className="btn small" disabled={busy} onClick={() => call("/api/admin/analyses", { id: a.id, action: "fail" })}>중단</button>}
                        <button className="btn small" disabled={busy} onClick={() => { if (confirm(`'${a.game_name}' 분석 기록을 삭제할까요? 되돌릴 수 없어요.`)) call("/api/admin/analyses", { id: a.id, action: "delete" }); }}>삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
