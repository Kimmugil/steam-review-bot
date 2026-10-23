"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { router.replace("/admin"); router.refresh(); } else setErr(j.error ?? "로그인에 실패했습니다.");
  }
  return (
    <div className="card" style={{ maxWidth: 420, margin: "48px auto" }}>
      <h2>관리자 로그인</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label htmlFor="pw" className="muted" style={{ fontSize: 13 }}>비밀번호</label>
        <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus style={{ width: "100%" }} />
        {err && <p className="down" style={{ fontSize: 13 }}>{err}</p>}
        <button className="btn primary" disabled={busy || !pw}>{busy ? "확인 중…" : "로그인"}</button>
        <p className="muted" style={{ fontSize: 12 }}>로그인은 8시간 동안 유지됩니다. 여러 번 틀리면 15분 동안 잠깁니다.</p>
      </form>
    </div>
  );
}
