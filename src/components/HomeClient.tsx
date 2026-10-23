"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal, RatingPill, Thumb } from "./ui";
import { dateKo, fill, pct1, tone } from "@/lib/format";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Hit = { appid: number; name: string; meta: string; image: string | null };
type Dlg =
  | { kind: "exists"; a: any; hit: Hit }
  | { kind: "active"; a: any }
  | { kind: "limit" }
  | { kind: "error"; msg: string }
  | null;

export default function HomeClient({ texts: t, data }: { texts: Texts; data: any }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [filter, setFilter] = useState("all");
  const [text, setText] = useState("");

  const left = Math.max(0, data.usage.limit - data.usage.used);

  async function request(appId: number, hit: Hit | null, force = false) {
    setBusy(true);
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ appId, force }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429 && j.status === "limit") return setDlg({ kind: "limit" });
      if (!r.ok) return setDlg({ kind: "error", msg: j.error ?? "요청을 보내지 못했습니다." });
      if (j.status === "created") return router.push(`/report/${j.id}`);
      if (j.status === "active") return setDlg({ kind: "active", a: j.analysis });
      if (j.status === "exists") return setDlg({ kind: "exists", a: j.analysis, hit: hit ?? { appid: appId, name: j.analysis.game_name, meta: "", image: j.analysis.header_image } });
      setDlg({ kind: "error", msg: "알 수 없는 응답입니다." });
    } catch {
      setDlg({ kind: "error", msg: "서버에 연결하지 못했습니다. 잠시 뒤에 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 화면이 완전히 준비되기 전에 입력한 글자도 놓치지 않도록, 상태값이 아니라 입력칸의 실제 값을 읽음
    const term = String(new FormData(e.currentTarget).get("q") ?? q).trim();
    if (term.length < 2) return;
    setBusy(true); setHits(null);
    try {
      const r = await fetch(`/api/steam-search?term=${encodeURIComponent(term)}`);
      const j = await r.json();
      if (!r.ok) return setDlg({ kind: "error", msg: j.error ?? "검색에 실패했습니다." });
      const list: Hit[] = j.hits ?? [];
      if (/^\d{3,9}$/.test(term) || /\/app\/\d+/.test(term)) {      // App ID·주소를 넣은 경우 바로 요청 단계로
        if (list.length === 1) { setBusy(false); return request(list[0].appid, list[0]); }
      }
      setHits(list);
    } catch {
      setDlg({ kind: "error", msg: "검색에 실패했습니다. 잠시 뒤에 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  const cards = (data.cards as any[]).filter((c) => (filter === "all" || tone(c.all_desc) === filter) && (!text || c.game_name.toLowerCase().includes(text.toLowerCase())));
  const counts: Record<string, number> = { all: data.cards.length };
  for (const k of ["good", "warn", "bad"]) counts[k] = (data.cards as any[]).filter((c) => tone(c.all_desc) === k).length;

  return (
    <>
      {data.error && <div className="notice err">데이터를 불러오지 못했습니다. 잠시 뒤에 다시 시도해 주세요. (관리자: /api/health 에서 연결 상태를 확인할 수 있어요)</div>}

      <section className="card hero">
        <h1>{t.home_title}</h1>
        <p>{t.home_desc}</p>
        <form className="reqbox" onSubmit={submit}>
          <input type="text" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.home_placeholder} aria-label="게임 이름, 스팀 상점 주소 또는 App ID" autoComplete="off" />
          <button className="btn primary" disabled={busy}>{busy ? "확인 중…" : t.home_btn}</button>
        </form>
        <div className="quota">
          <span>{t.home_quota} <b className="num">{left}</b> / {data.usage.limit}</span>
          <span className="meter" aria-hidden><i style={{ width: `${data.usage.limit ? (100 * left) / data.usage.limit : 0}%` }} /></span>
        </div>
        {hits && (
          <div className="res">
            {hits.map((h) => (
              <button key={h.appid} className="res-item" onClick={() => { setHits(null); request(h.appid, h); }} disabled={busy}>
                <Thumb appid={h.appid} name={h.name} src={h.image} size="s" />
                <div><div className="t">{h.name}</div><div className="m">{h.meta} · App ID {h.appid}</div></div>
              </button>
            ))}
            {hits.length === 0 && <p className="muted">검색 결과가 없어요. 스팀 상점 주소나 App ID를 붙여 넣어 보세요.</p>}
          </div>
        )}
      </section>

      {data.active.length > 0 && (
        <>
          <div className="sec-title"><h2>{t.home_progress_title}</h2><span>끝나면 이 목록에서 사라지고 아래 리포트로 올라가요</span></div>
          <div className="prog-list">
            {data.active.map((a: any) => (
              <Link key={a.id} href={`/report/${a.id}`} className="prog-card">
                <span className="spin" aria-hidden />
                <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="s" />
                <div><b>{a.game_name}</b><div className="muted small">{dateKo(a.requested_at, true)} 요청 · 진행 상황 보기 →</div></div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sec-title"><h2>{t.home_recent_title}</h2><span>{cards.length}개</span></div>
      <div className="toolbar">
        <div className="row" role="group" aria-label="평가별 보기">
          {[["all", "전체"], ["good", "긍정"], ["warn", "복합"], ["bad", "부정"]].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k]}</button>
          ))}
        </div>
        <label className="sp"><input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="게임 이름 찾기" aria-label="게임 이름 찾기" /></label>
      </div>
      <div className="gcards">
        {cards.length === 0 && <div className="empty" style={{ gridColumn: "1/-1" }}>{t.home_empty}</div>}
        {cards.map((c) => (
          <Link key={c.id} href={`/report/${c.id}`} className="gcard">
            <div className="img">
              <Thumb appid={Number(c.app_id)} name={c.game_name} src={c.header_image} />
              <RatingPill label={c.all_desc} title="스팀 상점 기준 전체 평가" />
              {c.method_version === 1 && <span className="newb" style={{ background: "var(--warn)", color: "#fff" }}>예전 방식</span>}
            </div>
            <div className="body">
              <div className="nm">{c.game_name}</div>
              <div className="one">{c.one_liner ?? "숫자만 저장된 리포트예요."}</div>
              <div className="nums">
                <span>{c.recent_label ?? "최근"}<b className={c.recent_rate != null ? "num" : "lbl"}>{c.recent_rate != null ? pct1(c.recent_rate) : (c.recent_desc ?? "-")}</b></span>
                {c.runs > 1 && <span>분석 <b className="num">{c.runs}</b>회</span>}
              </div>
              <div className="muted small">{dateKo(c.finished_at)} 분석</div>
            </div>
          </Link>
        ))}
      </div>

      {dlg?.kind === "exists" && (
        <Modal title={t.dlg_exists_title} onClose={() => setDlg(null)}>
          <div className="row" style={{ marginBottom: 12 }}>
            <Thumb appid={Number(dlg.a.app_id)} name={dlg.a.game_name} src={dlg.a.header_image} size="s" />
            <div><b>{dlg.a.game_name}</b><div className="muted small">{dateKo(dlg.a.finished_at, true)} 분석 · <RatingPill label={dlg.a.all_desc} /></div></div>
          </div>
          <p>{fill(t.dlg_exists_body, { date: dateKo(dlg.a.finished_at) })}</p>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn" disabled={busy} onClick={() => { const h = dlg.hit; setDlg(null); request(h.appid, h, true); }}>{t.dlg_exists_new}</button>
            <Link className="btn primary" href={`/report/${dlg.a.id}`}>{t.dlg_exists_view}</Link>
          </div>
        </Modal>
      )}
      {dlg?.kind === "active" && (
        <Modal title={t.dlg_active_title} onClose={() => setDlg(null)}>
          <p>{fill(t.dlg_active_body, { time: dateKo(dlg.a.requested_at, true) })}</p>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}><Link className="btn primary" href={`/report/${dlg.a.id}`}>{t.dlg_active_view}</Link></div>
        </Modal>
      )}
      {dlg?.kind === "limit" && (
        <Modal title="오늘은 여기까지예요" onClose={() => setDlg(null)}>
          <p>{t.dlg_limit}</p>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}><button className="btn primary" onClick={() => setDlg(null)}>알겠어요</button></div>
        </Modal>
      )}
      {dlg?.kind === "error" && (
        <Modal title="요청하지 못했어요" onClose={() => setDlg(null)}>
          <p>{dlg.msg}</p>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}><button className="btn primary" onClick={() => setDlg(null)}>닫기</button></div>
        </Modal>
      )}
    </>
  );
}
