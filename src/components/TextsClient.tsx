"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEXT_DEFS, TEXT_GROUPS, type Texts } from "@/lib/text-defs";

export default function TextsClient({ texts, saved }: { texts: Texts; saved: string[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Texts>(texts);
  const [done, setDone] = useState<Set<string>>(new Set(saved));
  const [msg, setMsg] = useState("");
  async function save(key: string, reset = false) {
    const r = await fetch("/api/admin/texts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value: vals[key], reset }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? j.message : j.error ?? "저장하지 못했습니다.");
    if (r.ok) {
      const d = new Set(done); reset ? d.delete(key) : d.add(key); setDone(d);
      if (reset) setVals({ ...vals, [key]: TEXT_DEFS.find((t) => t.key === key)!.def });
      router.refresh();
    }
  }
  return (
    <div className="txt-list">
      {msg && <div className="toast" role="status" onAnimationEnd={() => {}}>{msg}</div>}
      {TEXT_GROUPS.map((g) => (
        <details key={g} className="card txt-group" open>
          <summary>{g}</summary>
          <div className="in">
            {TEXT_DEFS.filter((t) => t.group === g).map((t) => (
              <div key={t.key} className="txt-item">
                <div><b>{t.label}</b> <span className="key">{t.key}</span>{done.has(t.key) && <span className="badge" style={{ marginLeft: 6 }}>수정됨</span>}</div>
                <div className="where">나오는 곳: {t.where}</div>
                <textarea value={vals[t.key] ?? ""} rows={2} onChange={(e) => setVals({ ...vals, [t.key]: e.target.value })} aria-label={t.label} />
                <div className="row"><button className="btn small primary" onClick={() => save(t.key)}>저장</button><button className="btn small" onClick={() => save(t.key, true)}>기본 문구로 되돌리기</button></div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
