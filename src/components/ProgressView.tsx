"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Thumb } from "./ui";
import { STEP_ORDER, dateKo, fill } from "@/lib/format";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 분석 진행 화면: 3초마다 상태를 확인하고, 끝나면 리포트를 보여 줍니다. 실패하면 이유를 숨기지 않고 보여 줍니다. */
export default function ProgressView({ a, texts: t }: { a: any; texts: Texts }) {
  const router = useRouter();
  const [st, setSt] = useState<{ status: string; step: string | null; error: string | null }>({ status: a.status, step: a.step, error: a.error });
  useEffect(() => {
    if (st.status === "done" || st.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/analyses/${a.id}/status`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setSt(j);
        if (j.status === "done") router.refresh();
      } catch { /* 일시적인 네트워크 오류는 다음 확인 때 다시 */ }
    }, 3000);
    return () => clearInterval(t);
  }, [a.id, st.status, router]);

  const idx = st.step ? STEP_ORDER.indexOf(st.step) : -1;
  return (
    <div className="stack">
      <Link href="/" className="back">{t.back_list}</Link>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="s" />
          <div><h2 style={{ margin: 0 }}>{a.game_name}</h2><div className="muted small">{fill(t.prog_requested, { time: dateKo(a.requested_at, true) })}</div></div>
        </div>
        {st.status === "failed" ? (
          <div className="notice err">
            <b>{t.prog_failed_title}</b>
            <p style={{ marginTop: 6 }}>{st.error ?? "알 수 없는 오류가 났어요."}</p>
            <p className="muted small" style={{ marginTop: 6 }}>{t.prog_failed_note}</p>
          </div>
        ) : (
          <>
            <p>{st.status === "queued" ? t.prog_queued : t.prog_running}</p>
            <ul className="steps2">
              {STEP_ORDER.map((k, i) => (
                <li key={k} className={st.status === "queued" ? "" : i < idx ? "done" : i === idx ? "on" : ""}>
                  <span className={i === idx && st.status === "running" ? "spin" : ""} style={i === idx && st.status === "running" ? undefined : { width: 16, textAlign: "center" }}>{st.status !== "queued" && i < idx ? "✓" : i === idx && st.status === "running" ? "" : "·"}</span>
                  {t[`step_${k}`]}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
