"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  th: { flex: "1 1 40%", background: "var(--surface-2)", fontSize: 11, fontWeight: 600 },
  step: { flex: "1 1 45%", fontSize: 12, borderLeft: "3px solid var(--good)" },
};

/** **굵게** 표시를 화면용 글자(굵은 글씨)로 바꿔 보여 줌 */
function Bold({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

function Mock({ defs, vals, active, onPick }: { defs: TextDef[]; vals: Texts; active: string | null; onPick: (k: string) => void }) {
  return (
    <div aria-label="화면 모양 미리보기" style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: 10, maxHeight: "calc(100vh - 120px)", overflow: "auto" }}>
      <div className="small muted" style={{ marginBottom: 8 }}>화면 모양 미리보기 · 번호 칸을 누르면 그 문구로 이동해요. 입력하면 바로 바뀌어요.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "stretch" }}>
        {defs.map((t, i) => {
          const on = active === t.key;
          return (
            <button key={t.key} type="button" onClick={() => onPick(t.key)} title={`${t.label} — ${t.where}`}
              style={{ ...KIND_STYLE[kindOf(t)], position: "relative", textAlign: "left", cursor: "pointer", padding: "6px 8px 6px 26px", border: on ? "2px solid var(--warn)" : "1px dashed var(--line)", outline: on ? "3px solid var(--warn-soft)" : "none", font: "inherit", lineHeight: 1.35, overflow: "hidden", maxHeight: 64, ...KIND_STYLE[kindOf(t)] }}>
              <span style={{ position: "absolute", left: 4, top: 5, minWidth: 16, height: 16, borderRadius: 8, background: on ? "var(--warn)" : "var(--cool)", color: "#fff", fontSize: 10, display: "grid", placeItems: "center", fontWeight: 700 }}>{i + 1}</span>
              {(vals[t.key] ?? "").split("\n")[0].slice(0, 90) ? <Bold text={(vals[t.key] ?? "").split("\n")[0].slice(0, 90)} /> : <i>(비어 있음)</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 글자 서식(굵게)을 눈으로 보면서 고치는 입력칸. 안쪽 저장 형식은 **굵게** 표기라서 사용자는 별표를 볼 일이 없음. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (md: string) => md.split("\n").map((l) => esc(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")).join("<br>");
function toMd(root: HTMLElement): string {
  let out = "";
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += c.textContent ?? "";
      else if (c instanceof HTMLElement) {
        const tag = c.tagName;
        if (tag === "BR") out += "\n";
        else if (tag === "B" || tag === "STRONG") { out += "**"; walk(c); out += "**"; }
        else if (tag === "DIV" || tag === "P") { if (out && !out.endsWith("\n")) out += "\n"; walk(c); }
        else walk(c);
      }
    });
  };
  walk(root);
  return out.replace(/\*\*\*\*/g, "").replace(/\n+$/, "");
}

function Editor({ value, onChange, onFocus, label, innerRef }: { value: string; onChange: (v: string) => void; onFocus: () => void; label: string; innerRef: (el: HTMLDivElement | null) => void }) {
  const el = useRef<HTMLDivElement | null>(null);
  const last = useRef(value);
  useEffect(() => { if (el.current && value !== last.current) { el.current.innerHTML = toHtml(value); last.current = value; } }, [value]);
  return (
    <div className="rte">
      <div className="rte-bar"><button type="button" className="btn small" onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); if (el.current) { const v = toMd(el.current); last.current = v; onChange(v); } }} aria-label="선택한 글자를 굵게"><b>가</b> 굵게</button></div>
      <div ref={(n) => { el.current = n; innerRef(n); if (n && !n.dataset.init) { n.dataset.init = "1"; n.innerHTML = toHtml(value); } }} className="rte-box" contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label={label}
        onFocus={onFocus}
        onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
        onInput={(e) => { const v = toMd(e.currentTarget); last.current = v; onChange(v); }} />
    </div>
  );
}

export default function TextsClient({ texts, saved }: { texts: Texts; saved: string[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Texts>(texts);
  const [orig, setOrig] = useState<Texts>(texts);
  const [done, setDone] = useState<Set<string>>(new Set(saved));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(TEXT_GROUPS[0]);
  const [active, setActive] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const items = useRef<Record<string, HTMLDivElement | null>>({});
  const dirty = useMemo(() => TEXT_DEFS.filter((t) => vals[t.key] !== orig[t.key]).map((t) => t.key), [vals, orig]);
  const defs = TEXT_DEFS.filter((t) => t.group === group);

  async function post(key: string, reset: boolean, value?: string) {
    const r = await fetch("/api/admin/texts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value, reset }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "저장하지 못했습니다.");
  }
  async function saveAll() {
    setBusy(true);
    try {
      const d = new Set(done), o = { ...orig };
      const failed: string[] = [];
      let ok = 0;
      for (const k of dirty) {
        try { await post(k, false, vals[k]); d.add(k); o[k] = vals[k]; ok++; }
        catch (e) { failed.push(`${TEXT_DEFS.find((t) => t.key === k)?.label ?? k}: ${(e as Error).message}`); }
      }
      setDone(d); setOrig(o); setErr(failed);
      setMsg(ok ? `${ok}개 문구를 저장했어요. 사이트에 반영돼요(최대 1분).` : "");
      if (ok) router.refresh();
    } finally { setBusy(false); }
  }
  async function reset(key: string) {
    setBusy(true);
    try {
      await post(key, true);
      const def = TEXT_DEFS.find((t) => t.key === key)!.def;
      setVals({ ...vals, [key]: def }); setOrig({ ...orig, [key]: def });
      const d = new Set(done); d.delete(key); setDone(d); setMsg("기본 문구로 되돌렸어요."); router.refresh();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const pick = (key: string) => {
    setActive(key);
    items.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    refs.current[key]?.focus({ preventScroll: true });
  };
  return (
    <div className="txt-list">
      {msg && <div className="toast" role="status">{msg}</div>}
      <div className="txt-tabs" role="tablist">
        {TEXT_GROUPS.map((g) => {
          const n = TEXT_DEFS.filter((t) => t.group === g && dirty.includes(t.key)).length;
          return <button key={g} role="tab" aria-selected={g === group} className="chip" onClick={() => { setGroup(g); setActive(null); }}>{g.replace(/^\d+\.\s*/, "")}{n > 0 && <span className="dot" aria-label={`고친 문구 ${n}개`}>{n}</span>}</button>;
        })}
      </div>
      {err.length > 0 && (
        <div className="notice err" role="alert"><b>저장하지 못한 문구가 있어요</b><ul style={{ margin: "6px 0 0 18px" }}>{err.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}
      <div className="txt-bar">
        <span className="muted small">{dirty.length ? `아직 저장하지 않은 문구 ${dirty.length}개` : "저장할 변경이 없어요"}</span>
        <button className="btn primary" disabled={!dirty.length || busy} onClick={saveAll}>{busy ? "저장 중…" : `변경한 문구 모두 저장${dirty.length ? ` (${dirty.length})` : ""}`}</button>
      </div>
      <div className="txt-split">
        <div className="txt-mock"><Mock defs={defs} vals={vals} active={active} onPick={pick} /></div>
        <div className="txt-edit">
          {defs.map((t, i) => (
            <div key={t.key} ref={(n) => { items.current[t.key] = n; }} className={`txt-item${active === t.key ? " on" : ""}${dirty.includes(t.key) ? " dirty" : ""}`}>
              <div className="head"><span className="badge">{i + 1}</span><b>{t.label}</b>{done.has(t.key) && <span className="badge">수정됨</span>}<span className="where">{t.where}</span></div>
              <Editor value={vals[t.key] ?? ""} label={t.label} innerRef={(n) => { refs.current[t.key] = n; }} onFocus={() => setActive(t.key)} onChange={(v) => setVals((p) => ({ ...p, [t.key]: v }))} />
              {vals[t.key] !== t.def && <button className="linkbtn" onClick={() => reset(t.key)} disabled={busy}>기본 문구로 되돌리기</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
