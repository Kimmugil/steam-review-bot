"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** 작은 ⓘ 버튼. 누르면 설명 말풍선이 열립니다. 읽는 법·계산 방법처럼 '필요한 사람만 보면 되는 글'을 숨겨 두는 용도. */
export function Info({ title = "어떻게 산출하나요?", wide, children }: { title?: string; wide?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="info" ref={box}>
      <button type="button" aria-label={title} aria-expanded={open} title={title} onClick={() => setOpen(!open)}>i</button>
      {open && <span className={`pop${wide ? " wide" : ""}`} role="note"><b>{title}</b>{children}</span>}
    </span>
  );
}
