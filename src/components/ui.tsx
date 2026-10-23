"use client";
import { useState } from "react";
import { tone } from "@/lib/format";

export const PAL = [["#2a4b5a", "#7a9a8a"], ["#4a3a5c", "#a07a9a"], ["#3b4a2c", "#9aa86a"], ["#5a3a2a", "#c9946a"], ["#2a3b5a", "#6a8ac9"], ["#4a2a3a", "#c96a8a"]];

export function Pill({ cls = "plain", children, title, nodot }: { cls?: string; children: React.ReactNode; title?: string; nodot?: boolean }) {
  return <span className={`pill ${cls}${nodot ? " nodot" : ""}`} title={title}>{children}</span>;
}

/** 평가 이름을 색 있는 알약으로 */
export function RatingPill({ label, title }: { label: string | null | undefined; title?: string }) {
  return <Pill cls={tone(label)} title={title}>{label ?? "평가 없음"}</Pill>;
}

/** 스팀 대표 이미지. 불러오지 못하면 색 배경과 게임 이름으로 대신 보여 줍니다. */
export function Thumb({ appid, name, src, size }: { appid: number; name: string; src?: string | null; size?: "s" | "xl" }) {
  const [broken, setBroken] = useState(false);
  const p = PAL[appid % PAL.length];
  return (
    <span className={`th ${size ?? ""}`} style={{ ["--c1" as string]: p[0], ["--c2" as string]: p[1] }}>
      <i className="ph">{name}</i>
      {src && !broken && <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />}
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h2>{title}</h2><button className="btn small" onClick={onClose}>닫기</button></div>
        {children}
      </div>
    </div>
  );
}

/** 긍정/부정 막대 (전체 폭 = 긍정 + 부정) */
export function PosNegBar({ pos, neg }: { pos: number; neg: number }) {
  const t = pos + neg || 1;
  return <div className="pbar" aria-label={`긍정 ${pos} 부정 ${neg}`}><i className="p" style={{ width: `${(100 * pos) / t}%` }} /><i className="n" style={{ width: `${(100 * neg) / t}%` }} /></div>;
}
