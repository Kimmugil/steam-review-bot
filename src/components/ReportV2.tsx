"use client";
import Link from "next/link";
import { useState } from "react";
import { PairBars, RateTable } from "./Charts";
import { Info } from "./Info";
import HistoryPicker from "./HistoryPicker";
import { Bullets, Rich } from "./Rich";
import { Modal, RatingPill, Thumb } from "./ui";
import { addDays, ageKo, dateKo, fill, noEmoji, num, pct1, signed, splitHighlights, wilsonPct } from "@/lib/format";
import { langName } from "@/lib/config";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = Record<number, { lang: string; voted_up: boolean; playtime_h: number | null; text: string }>;

function Rate({ r }: { r: any }) {
  if (!r || r.rate == null) return <span className="muted">-</span>;
  return <><b className="num">{pct1(r.rate)}</b> <span className="ci">({pct1(r.ci?.[0])}~{pct1(r.ci?.[1])})</span></>;
}

function Rv({ r, t }: { r: { n: number; lang: string; voted_up: boolean; playtime_h: number | null; text: string }; t: Texts }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rv2">
      <div className="m"><span>R{r.n}</span><span>{langName(r.lang)}</span><span className={r.voted_up ? "pos-t" : "neg-t"}>{r.voted_up ? t.ev_up : t.ev_down}</span>{r.playtime_h != null && <span>{r.playtime_h}시간</span>}</div>
      <div className={`tx${open ? " open" : ""}`}>{r.text}</div>
      {r.text.length > 260 && <button className="more" onClick={() => setOpen(!open)}>{open ? t.ev_less : t.ev_more}</button>}
    </div>
  );
}

/** 근거 리뷰는 아래로 길게 펼치지 않고 창으로 엽니다. 창 안에서만 스크롤되고, 추천/비추천만 골라 볼 수 있어요. */
function Evidence({ ids, ev, t, topic }: { ids: number[]; ev: Ev; t: Texts; topic?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<"all" | "up" | "down">("all");
  const list = ids.map((n) => ({ n, ...ev[n] })).filter((x) => x.text);
  if (!list.length) return null;
  const up = list.filter((x) => x.voted_up).length;
  const shown = list.filter((x) => (f === "all" ? true : f === "up" ? x.voted_up : !x.voted_up));
  return (
    <>
      <button className="evbtn" onClick={() => setOpen(true)}>{fill(t.ev_show, { label: t.ev_label, n: String(list.length) })}</button>
      {open && (
        <Modal wide title={fill(t.ev_title, { label: t.ev_label, topic: topic ?? "" }).replace(/ · $/, "")} onClose={() => setOpen(false)}>
          <div className="evfilter">
            {([["all", fill(t.ev_filter_all, { n: String(list.length) })], ["up", fill(t.ev_filter_up, { n: String(up) })], ["down", fill(t.ev_filter_down, { n: String(list.length - up) })]] as const).map(([k, l]) => (
              <button key={k} className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
            ))}
          </div>
          <div className="evlist">{shown.map((r) => <Rv key={r.n} r={r} t={t} />)}</div>
        </Modal>
      )}
    </>
  );
}

/**
 * 읽기 흐름의 한 덩어리. 모든 섹션이 같은 모양: 큰 제목(박스 밖) → 회색 한 줄 설명 → 내용 상자 1개.
 * 박스는 '내용을 묶어 보여 줄 때'만 쓰고, 박스 안에 박스를 또 넣지 않습니다. (bare: 방법 창처럼 이미 창 안일 때 상자 생략)
 */
function Sec({ title, sub, lead, info, bare, children }: { title: string; sub?: string; lead?: React.ReactNode; info?: React.ReactNode; bare?: boolean; children: React.ReactNode }) {
  return (
    <section className="rsec">
      <div className="sec-head">
        <h2>{title}{info && <span className="ih">{info}</span>}</h2>
        {sub && <p className="sub">{sub}</p>}
        {lead && <p className="lead">{lead}</p>}
      </div>
      {bare ? children : <div className="rbox">{children}</div>}
    </section>
  );
}

const TAB_KEYS = ["sum", "lang", "play", "chg"] as const;

export default function ReportV2({ a, stats: s, ai, news, ev, texts: t, admin, versions = [] }: { a: any; stats: any; ai: any; news: any[]; ev: Ev; texts: Texts; admin?: boolean; versions?: any[] }) {
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("sum");
  const [showHow, setShowHow] = useState(false);
  const sampleTotal = s.sample?.total ?? 0;
  const langN = (code: string) => s.sample?.languages?.find((x: any) => x.code === code)?.n ?? 0;
  const noise: number | null = s.profile.noise_points;
  const nz = noise != null ? noise.toFixed(1) : "";
  const pt = s.profile.playtime;
  const wl = s.window.label as string;
  const N = (n: number) => fill(t.num_reviews, { n: num(n) });
  const days = String(s.window.days);
  const nowRange = fill(t.period_range, { start: s.window.start, end: s.window.end });
  const prevRange = s.window.has_previous !== false && s.previous ? fill(t.period_range, { start: addDays(s.window.start, -s.window.days), end: s.window.start }) : "";

  // 스팀 구매로 표시된 리뷰가 거의 없는 게임(무료 배포 등)은 스팀 상점 기준 대신 전체 기준을 씁니다
  const offOk = s.official.total >= 10;
  const base = offOk ? s.official : s.all;
  const baseTitle = offOk ? t.kpi_official : t.kpi_all;
  const { findings, cautions } = splitHighlights(s.highlights ?? []);
  const langs: any[] = s.languages ?? [];
  const langsOk = langs.filter((l) => l.all.total >= 30 && l.all.rate != null);
  const topLangs = langs.slice(0, 6);
  const themes: any[] = ai?.themes ?? [];
  const themePos = themes.filter((x) => x.polarity === "positive"), themeNeg = themes.filter((x) => x.polarity === "negative"), themeMix = themes.filter((x) => x.polarity !== "positive" && x.polarity !== "negative");

  const maxShare = Math.max(0.01, ...themes.map((x) => x.support_share));
  const Theme = ({ th }: { th: any }) => {
    const [lo, hi] = wilsonPct(th.support, sampleTotal);
    const tip = fill(t.theme_share, { n: String(sampleTotal), k: String(th.support), pct: (th.support_share * 100).toFixed(0), lo: lo.toFixed(0), hi: hi.toFixed(0) });
    return (
      <div className={`thm ${th.polarity === "positive" ? "pos" : th.polarity === "negative" ? "neg" : "mix"}`}>
        <div className="thm-h">
          <b>{noEmoji(th.label)}</b>
          <span className="shr" title={tip}><span className="trk"><i style={{ width: `${(100 * th.support_share) / maxShare}%` }} /></span><em className="num">{(th.support_share * 100).toFixed(0)}%</em></span>
        </div>
        <p>{noEmoji(th.summary)}</p>
        <div className="thm-f">
          <span className="muted small">{fill(t.theme_rec, { pct: (th.pos_share * 100).toFixed(0) })}{th.polarity === "negative" && th.stance === "recommend" ? ` ${t.theme_rec_neg}` : th.polarity === "positive" && th.stance === "against" ? ` ${t.theme_rec_pos}` : ""}</span>
          <Evidence t={t} ids={th.review_ids} ev={ev} topic={noEmoji(th.label)} />
        </div>
      </div>
    );
  };

  const bestWorst = <T,>(list: T[], get: (x: T) => number) => {
    const sorted = [...list].sort((x, y) => get(y) - get(x));
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  };

  return (
    <div className="stack rpt">
      <Link href="/" className="back">{t.back_list}</Link>
      <div className="rhead">
        <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="xl" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>{a.game_name}</h1>
          <div className="meta">
            <span>{fill(t.rp_analyzed, { date: dateKo(a.finished_at, true) })}</span>
            <span>{fill(t.rp_period, { start: s.window.start, end: s.window.end, label: wl })}</span>
            {a.release_date && <span>{fill(t.rp_release, { date: String(a.release_date).slice(0, 10) })}</span>}
            <a href={`https://store.steampowered.com/app/${a.app_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t.rp_store}</a>
          </div>
          {ai?.one_liner && <p className="one">{noEmoji(ai.one_liner)}</p>}
          <HistoryPicker currentId={a.id} items={versions} label={t.hist_label} />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TAB_KEYS.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t[`tab_${k}`]}</button>)}
        <span className="spacer" />
        <button className="howbtn" onClick={() => setShowHow(true)}>{t.tab_how}</button>
      </div>

      {tab === "sum" && (
        <div>
          <section className="rsec">
            <div className="verdict2 rbox">
              <div className="vmain">
                <div className="t">{fill(t.kpi_recent, { label: wl })}</div>
                <div className="big num">{s.recent.rate != null ? pct1(s.recent.rate) : "-"}</div>
                <div style={{ marginTop: 6 }}><RatingPill label={s.recent.label} /></div>
                <div className="s">{fill(t.stat_main_sub, { n: N(s.recent.total) })}<br />{nowRange}</div>
              </div>
              <div className="vside">
                {ai ? (
                  <div className="aibox">
                    <span className="lab">{t.ai_title}<Info title={t.ai_title}><p>{t.ai_notice}</p></Info></span>
                    <p className="headline">{noEmoji(ai.headline)}</p>
                  </div>
                ) : (
                  <div className="aibox"><span className="lab">{t.ai_none_title}</span><p>{t.ai_none_body}</p></div>
                )}
                <div className="cmpline">
                  <span><em>{baseTitle}</em> <b className="num">{base.rate != null ? pct1(base.rate) : "-"}</b> <span className="muted small">{N(base.total)}{offOk ? ` · ${t.kpi_official_sub}` : ` · ${t.stat_all_note}`}</span></span>
                  {s.previous && <span><em>{fill(t.chart_row_prev, { days })}</em> <b className="num">{s.previous.rate != null ? pct1(s.previous.rate) : "-"}</b> <span className="muted small">{N(s.previous.total)}</span></span>}
                  {!s.previous && <span className="muted small">{t.kpi_no_prev}</span>}
                  <span className={`dchip ${s.delta_points != null ? (s.delta_notable ? (s.delta_points >= 0 ? "up" : "down") : "flat") : "flat"}`}>
                    <em>{t.stat_delta_title}</em> <b className="num">{s.delta_points != null ? signed(s.delta_points) : "-"}</b>
                    {s.delta_points != null && <Info title={fill(t.kpi_delta, { days })}><p>{prevRange}</p><p>{s.delta_notable ? t.kpi_delta_notable : t.kpi_delta_calm}</p></Info>}
                  </span>
                </div>
                <div className="basisline">
                  <span className="muted small">{t.basis_title}: {wl} · {t[`size_${s.profile.size_class}`] ?? ""}{noise != null ? ` · ±${nz}%p` : ""}</span>
                  <Info wide title={t.basis_title}>
                    <p className="muted small">{t.basis_sub}</p>
                    <ul>
                      <li><Rich text={fill(t.basis_age, { age: ageKo(s.profile.history_days), n: num(s.profile.volume.d30), size: t[`size_${s.profile.size_class}`] ?? "" })} />{s.profile.genres?.length ? ` · ${s.profile.genres.join(", ")}` : ""}{s.profile.is_free ? ` · ${t.basis_free}` : ""}{s.profile.early_access ? ` · ${t.basis_ea}` : ""}</li>
                      <li><Rich text={fill(t.basis_window, { label: wl, n: num(s.window.reviews), reason: s.window.reason })} /> ({nowRange})</li>
                      <li><Rich text={noise != null ? fill(t.basis_noise, { noise: nz, n: String(s.profile.baseline_windows) }) : t.basis_noise_unknown} /></li>
                      <li>{pt ? fill(t.basis_playtime, { b1: String(pt.bounds[0]), b2: String(pt.bounds[1]), b3: String(pt.bounds[2]) }) : t.basis_playtime_none}</li>
                    </ul>
                  </Info>
                </div>
              </div>
            </div>
            {(s.data_notes?.length > 0 || cautions.length > 0) && (
              <div className="callout warn" style={{ marginTop: 12 }}><h3>{t.notes_title}</h3><ul>{[...(s.data_notes ?? []), ...cautions].map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>
            )}
          </section>

          {findings.length > 0 && (
            <Sec title={t.highlights_title} sub={t.highlights_sub}>
              <ul className="pts">{findings.slice(0, 5).map((h: string, i: number) => <li key={i}><span>{h}</span></li>)}</ul>
              {findings.length > 5 && (
                <details style={{ marginTop: 10 }}><summary className="muted small" style={{ cursor: "pointer" }}>+{findings.length - 5}</summary>
                  <ul className="pts" style={{ marginTop: 8 }}>{findings.slice(5).map((h: string, i: number) => <li key={i}><span>{h}</span></li>)}</ul></details>
              )}
            </Sec>
          )}

          {ai && (
            <Sec title={t.themes_title} sub={fill(t.themes_sub, { n: num(sampleTotal) })}>
              {themes.length === 0 && <div className="empty">{t.themes_empty}</div>}
              <div className="cols2">
                {themePos.length > 0 && <div><h3 style={{ marginTop: 0 }}>{t.theme_pos}</h3>{themePos.map((th, i) => <Theme key={i} th={th} />)}</div>}
                {themeNeg.length > 0 && <div><h3 style={{ marginTop: 0 }}>{t.theme_neg}</h3>{themeNeg.map((th, i) => <Theme key={i} th={th} />)}</div>}
              </div>
              {themeMix.length > 0 && <div style={{ marginTop: 8 }}><h3>{t.themes_mix_title}</h3>{themeMix.map((th, i) => <Theme key={i} th={th} />)}</div>}
            </Sec>
          )}

          {ai?.quotes?.length > 0 && (
            <Sec title={t.quotes_title} sub={t.quotes_sub} info={<Info title={t.quotes_title}><p>{ai.quote_rule ? fill(t.quotes_rule, { rate: ai.quote_rule.rate != null ? ai.quote_rule.rate.toFixed(1) : "-", pos: String(ai.quote_rule.pos), neg: String(ai.quote_rule.neg) }) : t.quotes_rule_old}</p></Info>}>
              <div className="qgrid">
                {ai.quotes.map((q: any) => (
                  <div key={q.review_id} className={`qcard ${q.voted_up ? "pos" : "neg"}`}>
                    <div className="m"><span>{langName(q.language)}</span><span className={q.voted_up ? "pos-t" : "neg-t"}>{q.voted_up ? t.ev_up : t.ev_down}</span>{q.playtime_h != null && <span>{q.playtime_h}시간</span>}</div>
                    <div className="qtx">{q.korean || q.original}</div>
                    {q.korean && <details className="orig"><summary>{t.quotes_orig}</summary><div>{q.original}</div><div className="muted small">{t.quotes_ai_tr}</div></details>}
                  </div>
                ))}
              </div>
            </Sec>
          )}

        </div>
      )}

      {tab === "lang" && (
        <div>
          <Sec title={t.chart_lang_rate} info={<Info title={t.lang_warn_title}><p>{t.lang_notice}</p><p>{t.chart_bar_help} {t.chart_lang_help}</p><p>{t.ai_lang_sub}</p></Info>} lead={(() => {
            if (!langs.length) return null;
            const top = langs[0];
            if (langsOk.length < 2) return fill(t.lead_lang_one, { top: noEmoji(top.name), share: top.share.toFixed(0) });
            const { best, worst } = bestWorst(langsOk, (l) => l.all.rate);
            return fill(t.lead_lang, { top: noEmoji(top.name), share: top.share.toFixed(0), best: noEmoji(best.name), bestRate: best.all.rate.toFixed(1), worst: noEmoji(worst.name), worstRate: worst.all.rate.toFixed(1) });
          })()}>
            <RateTable refRate={s.all?.rate ?? null} rows={langsOk.slice(0, 10).map((l) => {
              const n = ai?.language_notes?.find((x: any) => x.language_code === l.code);
              const odd = (s.outliers ?? []).some((o: any) => o.code === l.code);
              return {
                key: l.code, label: noEmoji(l.name), sub: `${t.lang_col_share} ${l.share.toFixed(0)}%`, pos: l.all.pos, neg: l.all.neg, flag: odd ? t.lang_flag : undefined,
                note: n ? <><span>{noEmoji(n.summary)}</span><span className="rt-meta muted small">{fill(t.note_basis, { n: String(n.sample_n) })}</span><Evidence t={t} ids={n.review_ids} ev={ev} topic={noEmoji(n.name)} /></> : <span className="muted small">{t.lang_note_none}</span>,
              };
            })} />
            <p className="help">{fill(t.chart_ref_line, { label: t.chart_lang_all, rate: s.all?.rate != null ? s.all.rate.toFixed(1) : "-" })}</p>
          </Sec>

          <details className="fold">
            <summary>{t.more_table}</summary>
            <div className="in">
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t.lang_col_lang}</th><th>{t.lang_col_share}</th><th>{t.lang_col_all}</th><th>{wl}</th><th>{t.lang_col_prev}</th><th>{t.lang_col_sample}</th></tr></thead>
                  <tbody>
                    {langs.slice(0, 14).map((l: any) => (
                      <tr key={l.code}>
                        <td>{noEmoji(l.name)}<div className="muted small">{N(l.all.total)}</div></td>
                        <td><div className="langbar"><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, l.share)}%` }} /></div><span className="num">{l.share.toFixed(1)}%</span></div></td>
                        <td><Rate r={l.all} /> <RatingPill label={l.all.label} /></td>
                        <td>{l.window ? <><Rate r={l.window} /><div className="muted small">{N(l.window.total)}{!l.window.reliable ? ` · ${t.small_sample}` : ""}</div></> : <span className="muted">-</span>}</td>
                        <td>{l.prev ? <span className="num">{pct1(l.prev.rate)}</span> : <span className="muted">-</span>}</td>
                        <td className="num">{langN(l.code) || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="help">{t.lang_help}</p>
              <h3 style={{ margin: "8px 0 0" }}>{t.grp_title}</h3>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t.grp_col_group}</th><th>{t.grp_col_langs}</th><th>{t.lang_col_share}</th><th>{t.lang_col_all}</th></tr></thead>
                  <tbody>
                    {s.groups.map((g: any) => (
                      <tr key={g.group}><td>{noEmoji(g.group)}</td><td className="small muted">{g.languages.map(noEmoji).join(", ")}</td><td className="num">{g.share.toFixed(1)}%</td><td><Rate r={g.all} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
      )}

      {tab === "play" && (
        !pt ? (
          <div className="callout warn"><h3>{t.play_none_title}</h3><p>{fill(t.play_none_body, { pct: (s.profile.playtime_coverage * 100).toFixed(1) })}</p></div>
        ) : (
          <div>
            <Sec title={fill(t.chart_play_rate, { label: wl })} info={<Info title={t.chart_play_rate_info}><p>{t.chart_bar_help}</p><p>{fill(t.chart_ref_line, { label: wl, rate: s.recent.rate != null ? s.recent.rate.toFixed(1) : "-" })}</p></Info>} lead={(() => {
              const ok = (s.segments as any[]).filter((g) => g.window.total >= 30 && g.window.rate != null);
              if (ok.length < 2) return null;
              const { best, worst } = bestWorst(ok, (g) => g.window.rate);
              return fill(t.lead_play, { best: best.label, bestRange: best.range, bestRate: best.window.rate.toFixed(1), worst: worst.label, worstRange: worst.range, worstRate: worst.window.rate.toFixed(1) });
            })()}>
              <RateTable refRate={s.recent.rate} rows={(s.segments as any[]).map((g) => {
                const n = ai?.segment_notes?.find((x: any) => x.segment_key === g.key);
                return {
                  key: g.key, label: g.label, sub: g.range, pos: g.window.pos, neg: g.window.neg,
                  note: n ? <><span>{noEmoji(n.summary)}</span><span className="rt-meta muted small">{fill(t.note_basis, { n: String(n.sample_n) })}{!g.window.reliable ? ` · ${t.small_sample}` : ""}</span><Evidence t={t} ids={n.review_ids} ev={ev} topic={g.label} /></> : <span className="muted small">{!g.window.reliable ? t.small_sample : t.seg_note_none}</span>,
                };
              })} />
            </Sec>

            <Sec title={t.chart_play_share}>
              <PairBars aLabel={t.chart_play_a} bLabel={wl} rows={s.segments.map((g: any) => ({ label: g.label, sub: g.range, a: g.share_all, b: g.share_window }))} />
              <p className="help">{fill(t.chart_play_share_help, { label: wl })}</p>
            </Sec>

            <details className="fold">
              <summary>{t.more_table}</summary>
              <div className="in">
                <div className="callout" style={{ margin: 0 }}><h3>{t.play_title}</h3>
                  <p>{fill(t.play_body, { b1: String(pt.bounds[0]), b2: String(pt.bounds[1]), b3: String(pt.bounds[2]), n: num(pt.reviewers) })}</p></div>
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>{t.seg_col_seg}</th><th>{t.seg_col_share}<div className="muted small" style={{ fontWeight: 400 }}>{fill(t.seg_col_share_sub, { label: wl })}</div></th><th>{fill(t.seg_col_window, { label: wl })}</th><th>{t.seg_col_all}</th></tr></thead>
                    <tbody>
                      {s.segments.map((g: any) => (
                        <tr key={g.key}>
                          <td><b>{g.label}</b><div className="muted small">{g.range}</div></td>
                          <td className="num">{g.share_all.toFixed(0)}% → <b>{g.share_window.toFixed(0)}%</b></td>
                          <td><Rate r={g.window} /><div className="muted small">{N(g.window.total)}{!g.window.reliable ? ` · ${t.small_sample}` : ""}</div></td>
                          <td><Rate r={g.all} /><div className="muted small">{N(g.all.total)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="help">{t.seg_help}</p>
              </div>
            </details>
          </div>
        )
      )}

      {tab === "chg" && (
        <div>
          <Sec title={t.chg_title} lead={s.previous && s.delta_points != null ? fill(t.lead_chg, { days, prev: pct1(s.previous.rate).replace("%", ""), label: wl, now: pct1(s.recent.rate).replace("%", ""), diff: signed(s.delta_points) }) : undefined}>
            {s.previous ? (
              <RateTable rows={[
                { key: "prev", label: fill(t.chg_prev, { days }), sub: prevRange, pos: s.previous.pos, neg: s.previous.neg },
                { key: "now", label: wl, sub: nowRange, pos: s.recent.pos, neg: s.recent.neg },
              ]} />
            ) : <p className="muted">{t.chg_none}</p>}
            {s.delta_points != null && <p className="help">{fill(t.chg_diff, { diff: signed(s.delta_points) })} {s.delta_notable ? (noise != null ? fill(t.chg_notable_n, { noise: nz }) : t.chg_notable) : (noise != null ? fill(t.chg_calm_n, { noise: nz }) : t.chg_calm)}</p>}
            <p className="help">{s.window.reason}</p>
          </Sec>

          {ai?.change_notes?.length > 0 && (
            <Sec title={t.chg_ai_title}>
              <ul className="pts">{ai.change_notes.map((c: any, i: number) => <li key={i}><span>{noEmoji(c.text)}{c.review_ids?.length > 0 && <Evidence t={t} ids={c.review_ids} ev={ev} />}</span></li>)}</ul>
            </Sec>
          )}

          <Sec title={t.news_title} sub={t.news_sub}>
            {news.length === 0 ? <div className="empty">{t.news_empty}</div> : (
              <div>
                {news.map((n: any, i: number) => {
                  const note = ai?.news_notes?.find((x: any) => x.title && n.title.startsWith(x.title.slice(0, 20))) ?? ai?.news_notes?.[i];
                  return (
                    <div key={i} className="tl">
                      <div className="nm"><b>{n.title}</b><span>{n.date}</span></div>
                      {note?.summary && <p>{noEmoji(note.summary)} <span className="ai-tag">{t.news_ai}</span></p>}
                      <a href={n.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>{t.news_link}</a>
                    </div>
                  );
                })}
              </div>
            )}
          </Sec>
        </div>
      )}

      {showHow && (
        <Modal wide title={t.tab_how} onClose={() => setShowHow(false)}>
          <div className="evlist" style={{ maxHeight: "72vh" }}>
          <Sec bare title={t.how_title}>
            <Bullets text={fill(t.how_body, { method: s.sample?.method ?? "" })} />
          </Sec>
          <Sec bare title={fill(t.how_sample_title, { n: num(sampleTotal) })}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>{t.how_sample_col1}</th><th className="n">{t.how_sample_col2}</th><th className="n">{t.how_sample_col3}</th></tr></thead>
              <tbody>{(s.sample?.languages ?? []).map((x: any) => <tr key={x.code}><td>{noEmoji(x.name)}</td><td className="n num">{x.n}</td><td className="n num">{num(x.window_total)}</td></tr>)}</tbody>
            </table></div>
          </Sec>
          {ai && (
            <Sec bare title={t.how_ai_title}>
              <ul>
                <li>{fill(t.how_model, { model: ai.model })}</li>
                <li>{fill(t.how_dropped, { a: String(ai.dropped?.unknown_ids ?? 0), b: String(ai.dropped?.empty_themes ?? 0) })}</li>
                {ai.caveats?.map((c: string, i: number) => <li key={i}>{noEmoji(c)}</li>)}
              </ul>
            </Sec>
          )}
          <p className="muted small" style={{ marginTop: 24 }}>{fill(t.how_fetched, { time: dateKo(s.fetched_at, true), v: String(a.method_version) })}{admin ? ` · ID ${a.id}` : ""}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
