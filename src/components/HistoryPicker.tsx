"use client";
import { useRouter } from "next/navigation";
import { dateKo } from "@/lib/format";

/** 같은 게임의 지난 분석을 골라 보는 상자 (2건 이상일 때만 보임) */
export default function HistoryPicker({ currentId, items }: { currentId: string; items: { id: string; finished_at: string; method_version: number; all_desc: string | null }[] }) {
  const router = useRouter();
  if (items.length < 2) return null;
  return (
    <label className="row small" style={{ gap: 8, marginTop: 8 }}>
      <span className="muted">이 게임의 분석 기록 {items.length}건</span>
      <select value={currentId} onChange={(e) => router.push(`/report/${e.target.value}`)} aria-label="지난 분석 고르기">
        {items.map((v, i) => (
          <option key={v.id} value={v.id}>{dateKo(v.finished_at, true)}{i === 0 ? " (가장 최근)" : ""}{v.method_version === 1 ? " · 예전 방식" : ""}{v.all_desc ? ` · ${v.all_desc}` : ""}</option>
        ))}
      </select>
    </label>
  );
}
