"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Thumb } from "./ui";
import { STEP_LABELS, STEP_ORDER, dateKo } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 분석 진행 화면: 3초마다 상태를 확인하고, 끝나면 리포트를 보여 줍니다. 실패하면 이유를 숨기지 않고 보여 줍니다. */
export default function ProgressView({ a }: { a: any }) {
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
      <Link href="/" className="back">← 목록으로</Link>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="s" />
          <div><h2 style={{ margin: 0 }}>{a.game_name}</h2><div className="muted small">{dateKo(a.requested_at, true)} 요청</div></div>
        </div>
        {st.status === "failed" ? (
          <div className="notice err">
            <b>분석하지 못했어요.</b>
            <p style={{ marginTop: 6 }}>{st.error ?? "알 수 없는 오류가 났어요."}</p>
            <p className="muted small" style={{ marginTop: 6 }}>이 요청은 오늘 분석 횟수에서 빠지지 않았어요. 잠시 뒤 다시 요청해 보세요.</p>
          </div>
        ) : (
          <>
            <p>{st.status === "queued" ? "분석 순서를 기다리고 있어요. 보통 1분 안에 시작돼요." : "분석 중이에요. 보통 1~3분 걸려요. 이 화면을 열어 두면 끝나는 대로 결과가 나와요."}</p>
            <ul className="steps2">
              {STEP_ORDER.map((k, i) => (
                <li key={k} className={st.status === "queued" ? "" : i < idx ? "done" : i === idx ? "on" : ""}>
                  <span className={i === idx && st.status === "running" ? "spin" : ""} style={i === idx && st.status === "running" ? undefined : { width: 16, textAlign: "center" }}>{st.status !== "queued" && i < idx ? "✓" : i === idx && st.status === "running" ? "" : "·"}</span>
                  {STEP_LABELS[k]}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
