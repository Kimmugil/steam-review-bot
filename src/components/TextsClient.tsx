"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { TEXT_DEFS, TEXT_GROUPS, type TextDef, type Texts } from "@/lib/text-defs";

type Kind = "title" | "text" | "btn" | "chip" | "tab" | "th" | "step" | "box";

/** 문구가 화면에서 어떤 모양으로 놓이는지(목업용). 이름 규칙으로 정합니다. */
function kindOf(t: TextDef): Kind {
  const k = t.key;
  if (/^tab_/.test(k)) return "tab";
  if (/^home_filter/.test(k)) return "chip";
  if (/^step_/.test(k)) return "step";
  if (/_col\d?(_|$)|^lang_col|^grp_col|^seg_col|^how_sample_col/.test(k)) return "th";
  if (/^(home_btn|dlg_close|dlg_\w+_(view|new|ok)|nav_|card_legacy)/.test(k)) return "btn";
  if (/_title$|^home_title|^site_title|^about_\d_title/.test(k)) return "title";
  if (t.long || t.def.length > 70) return "box";
  return "text";
}

const KIND_STYLE: Record<Kind, React.CSSProperties> = {
  title: { flex: "1 1 100%", fontWeight: 700, fontSize: 14 },
  text: { flex: "1 1 40%", fontSize: 12, color: "var(--muted)" },
  box: { flex: "1 1 100%", fontSize: 12, background: "var(--surface-2)", borderRadius: 8 },
  btn: { flex: "0 0 auto", background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  chip: { flex: "0 0 auto", background: "var(--accent-soft)", borderRadius: 999, fontSize: 12 },
  tab: { flex: "0 0 auto", borderBottom: "2px solid var(--accent)", fontSize: 12, fontWeight: 600 },
  th: { flex: "1 1 18%", background: "var(--surface-2)", fontSize: 11, fontWeight: 600 },
  step: { flex: "1 1 45%", fontSize: 12, borderLeft: "3px solid var(--good)" },
};

function Mock({ defs, vals, active, onPick }: { defs: TextDef[]; vals: Texts; active: string | null; onPick: (k: string) => void }) {
  return (
    <div className="mock" aria-label="화면 모양 미리보기" style={{ position: "sticky", top: 8, zIndex: 2, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: 10, margin: "8px 0 14px", maxHeight: "42vh", overflow: "auto" }}>
      <div className="small muted" style={{ marginBottom: 6 }}>화면 모양 미리보기 — 번호 칸을 누르면 그 문구 입력칸으로 이동해요. 입력하면 칸 안 글자가 바로 바뀌어요.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "stretch" }}>
        {defs.map((t, i) => {
          const on = active === t.key;
          return (
            <button key={t.key} type="button" onClick={() => onPick(t.key)} title={`${t.label} — ${t.where}`}
              style={{ ...KIND_STYLE[kindOf(t)], position: "relative", textAlign: "left", cursor: "pointer", padding: "6px 8px 6px 26px", border: on ? "2px solid var(--warn)" : "1px dashed var(--line)", outline: on ? "3px solid var(--warn-soft)" : "none", font: "inherit", lineHeight: 1.35, overflow: "hidden", maxHeight: 64, ...KIND_STYLE[kindOf(t)] }}>
              <span style={{ position: "absolute", left: 4, top: 5, minWidth: 16, height: 16, borderRadius: 8, background: on ? "var(--warn)" : "var(--cool)", color: "#fff", fontSize: 10, display: "grid", placeItems: "center", fontWeight: 700 }}>{i + 1}</span>
              {(vals[t.key] ?? "").split("\n")[0].slice(0, 90) || <i>(비어 있음)</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TextsClient({ texts, saved }: { texts: Texts; saved: string[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Texts>(texts);
  const [done, setDone] = useState<Set<string>>(new Set(saved));
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
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
  const pick = (key: string) => {
    setActive(key);
    const el = refs.current[key];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };
  return (
    <div className="txt-list">
      {msg && <div className="toast" role="status">{msg}</div>}
      {TEXT_GROUPS.map((g) => {
        const defs = TEXT_DEFS.filter((t) => t.group === g);
        return (
          <details key={g} className="card txt-group" open={g.startsWith("1.") || g.startsWith("2.")}>
            <summary>{g} <span className="muted small">({defs.length}개)</span></summary>
            <div className="in">
              <Mock defs={defs} vals={vals} active={active} onPick={pick} />
              {defs.map((t, i) => (
                <div key={t.key} className="txt-item" style={active === t.key ? { outline: "2px solid var(--warn)", borderRadius: 8 } : undefined}>
                  <div><span className="badge" style={{ marginRight: 6 }}>{i + 1}</span><b>{t.label}</b> <span className="key">{t.key}</span>{done.has(t.key) && <span className="badge" style={{ marginLeft: 6 }}>수정됨</span>}</div>
                  <div className="where">나오는 곳: {t.where}</div>
                  <textarea ref={(el) => { refs.current[t.key] = el; }} value={vals[t.key] ?? ""} rows={t.long ? Math.min(14, Math.max(3, (vals[t.key] ?? "").split("\n").length + 1)) : 2}
                    onFocus={() => setActive(t.key)} onChange={(e) => setVals({ ...vals, [t.key]: e.target.value })} aria-label={t.label} />
                  <div className="row"><button className="btn small primary" onClick={() => save(t.key)}>저장</button><button className="btn small" onClick={() => save(t.key, true)}>기본 문구로 되돌리기</button></div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
