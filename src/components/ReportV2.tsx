"use client";
import Link from "next/link";
import { useState } from "react";
import { Donut, PairBars, RateDots } from "./Charts";
import HistoryPicker from "./HistoryPicker";
import { Bullets, Rich } from "./Rich";
import { Pill, PosNegBar, RatingPill, Thumb } from "./ui";
import { ageKo, dateKo, fill, noEmoji, num, pct1, signed } from "@/lib/format";
import { langName } from "@/lib/config";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = Record<number, { lang: string; voted_up: boolean; playtime_h: number | null; text: string }>;

function Rate({ r }: { r: any }) {
  if (!r || r.rate == null) return <span className="muted">-</span>;
  return <><b className="num">{pct1(r.rate)}</b> <span className="ci">({pct1(r.ci?.[0])}~{pct1(r.ci?.[1])})</span></>;
}

function Evidence({ ids, ev, t }: { ids: number[]; ev: Ev; t: Texts }) {
  const list = ids.map((n) => ({ n, ...ev[n] })).filter((x) => x.text);
  if (!list.length) return null;
  return (
    <details className="ev">
      <summary>{fill(t.ev_show, { label: t.ev_label, n: String(list.length) })}</summary>
      <div className="rvs">
        {list.map((r) => (
          <div key={r.n} className="rv2">
            <div className="m"><span>R{r.n}</span><span>{langName(r.lang)}</span><span className={r.voted_up ? "pos-t" : "neg-t"}>{r.voted_up ? t.ev_up : t.ev_down}</span>{r.playtime_h != null && <span>{r.playtime_h}시간</span>}</div>
            {r.text}
          </div>
        ))}
      </div>
    </details>
  );
}

function KCard({ k, label, r, sub, t }: { k: string; label?: string; r: any; sub?: React.ReactNode; t: Texts }) {
  return (
    <div className="kcard">
      <div className="k">{k}</div>
      <div className="v">{r.rate != null ? pct1(r.rate) : "-"}</div>
      <div className="l"><RatingPill label={label ?? r.label} /></div>
      <div className="s">{fill(t.num_reviews, { n: num(r.total) })}{r.ci ? ` · ${fill(t.kpi_ci, { lo: pct1(r.ci[0]), hi: pct1(r.ci[1]) })}` : ""}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

const TAB_KEYS = ["sum", "lang", "play", "chg", "how"] as const;

export default function ReportV2({ a, stats: s, ai, news, ev, texts: t, admin, versions = [] }: { a: any; stats: any; ai: any; news: any[]; ev: Ev; texts: Texts; admin?: boolean; versions?: any[] }) {
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("sum");
  const sampleTotal = s.sample?.total ?? 0;
  const langN = (code: string) => s.sample?.languages?.find((x: any) => x.code === code)?.n ?? 0;
  const noise: number | null = s.profile.noise_points;
  const nz = noise != null ? noise.toFixed(1) : "";
  const pt = s.profile.playtime;
  const wl = s.window.label as string;
  const topLangs: any[] = (s.languages ?? []).slice(0, 6);
  const restShare = Math.max(0, 100 - topLangs.reduce((x: number, l: any) => x + l.share, 0));
  const donutItems = [...topLangs.map((l: any) => ({ label: noEmoji(l.name), value: l.share })), ...(restShare >= 1 ? [{ label: t.chart_other, value: restShare }] : [])];
  const row = (label: string, r: any, sub?: string) => ({ label, sub, rate: r?.rate ?? null, lo: r?.ci?.[0] ?? null, hi: r?.ci?.[1] ?? null });
  const cmpRows = [row(t.chart_row_official, s.official), row(wl, s.recent), ...(s.previous ? [row(fill(t.chart_row_prev, { days: String(s.window.days) }), s.previous)] : [])];
  const N = (n: number) => fill(t.num_reviews, { n: num(n) });
  return (
    <div className="stack">
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
      </div>

      {tab === "sum" && (
        <div className="stack">
          <div className="kpi4">
            <KCard t={t} k={t.kpi_official} r={s.official} label={s.official.steam_label ?? s.official.label} sub={t.kpi_official_sub} />
            <KCard t={t} k={fill(t.kpi_recent, { label: wl })} r={s.recent} sub={s.delta_points != null ? <>{fill(t.kpi_delta, { days: String(s.window.days) })} <b className={s.delta_notable ? (s.delta_points >= 0 ? "up" : "down") : "flat"}>{signed(s.delta_points)}</b> {s.delta_notable ? t.kpi_delta_notable : t.kpi_delta_calm}</> : t.kpi_no_prev} />
            <KCard t={t} k={t.kpi_all} r={s.all} sub={t.kpi_all_sub} />
          </div>

          <div className="grid2c">
            <div className="card">
              <h3>{t.chart_donut_title}</h3>
              <Donut items={donutItems} />
            </div>
            <div className="card">
              <h3>{t.chart_cmp_title}</h3>
              <RateDots refRate={s.official.rate} refLabel={t.chart_ref} rows={cmpRows} />
              <p className="help">{t.chart_help}</p>
            </div>
          </div>

          <div className="callout">
            <h3>{t.basis_title} <span className="muted" style={{ fontWeight: 400 }}>{t.basis_sub}</span></h3>
            <ul>
              <li><Rich text={fill(t.basis_age, { age: ageKo(s.profile.history_days), n: num(s.profile.volume.d30), size: t[`size_${s.profile.size_class}`] ?? "" })} />{s.profile.genres?.length ? ` · ${s.profile.genres.join(", ")}` : ""}{s.profile.is_free ? ` · ${t.basis_free}` : ""}{s.profile.early_access ? ` · ${t.basis_ea}` : ""}</li>
              <li><Rich text={fill(t.basis_window, { label: wl, n: num(s.window.reviews), reason: s.window.reason })} /></li>
              <li><Rich text={noise != null ? fill(t.basis_noise, { noise: nz, n: String(s.profile.baseline_windows) }) : t.basis_noise_unknown} /></li>
              <li>{pt ? fill(t.basis_playtime, { b1: String(pt.bounds[0]), b2: String(pt.bounds[1]), b3: String(pt.bounds[2]) }) : t.basis_playtime_none}</li>
            </ul>
          </div>

          {s.highlights?.length > 0 && (
            <div className="callout">
              <h3>{t.highlights_title} <span className="muted" style={{ fontWeight: 400 }}>{t.highlights_sub}</span></h3>
              <ul>{s.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}

          {s.data_notes?.length > 0 && (
            <div className="callout warn"><h3>{t.notes_title}</h3><ul>{s.data_notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>
          )}

          {ai ? (
            <>
              <div className="callout ai">
                <h3>{t.ai_title} <span className="muted" style={{ fontWeight: 400 }}>· {t.ai_notice}</span></h3>
                <p>{noEmoji(ai.headline)}</p>
              </div>
              <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>{t.themes_title}</h2><span>{fill(t.themes_sub, { n: num(sampleTotal) })}</span></div>
              <div className="themes">
                {ai.themes.length === 0 && <div className="empty">{t.themes_empty}</div>}
                {ai.themes.map((th: any, i: number) => (
                  <div key={i} className="theme">
                    <div className="top">
                      <Pill cls={th.polarity === "positive" ? "good" : th.polarity === "negative" ? "bad" : "warn"} title="AI">{th.polarity === "positive" ? t.theme_pos : th.polarity === "negative" ? t.theme_neg : t.theme_mix}</Pill>
                      <b>{th.label}</b>
                      <span className="share num">{fill(t.theme_share, { n: String(sampleTotal), k: String(th.support), pct: (th.support_share * 100).toFixed(0) })}</span>
                    </div>
                    <div className="sbar"><i className={th.polarity === "positive" ? "pos" : th.polarity === "negative" ? "neg" : "mix"} style={{ width: `${Math.min(100, th.support_share * 100 * 3)}%` }} /></div>
                    <p>{th.summary}</p>
                    <div className="muted small">{fill(t.theme_rec, { pct: (th.pos_share * 100).toFixed(0) })}{th.polarity === "negative" && th.stance === "recommend" ? ` ${t.theme_rec_neg}` : th.polarity === "positive" && th.stance === "against" ? ` ${t.theme_rec_pos}` : ""}</div>
                    <Evidence t={t} ids={th.review_ids} ev={ev} />
                  </div>
                ))}
              </div>
              {ai.quotes?.length > 0 && (
                <>
                  <div className="sec-title" style={{ margin: "8px 0 0" }}><h2>{t.quotes_title}</h2><span>{t.quotes_sub}</span></div>
                  <div className="rvs">
                    {ai.quotes.map((q: any) => (
                      <div key={q.review_id} className="rv2">
                        <div className="m"><span>{langName(q.language)}</span><span className={q.voted_up ? "pos-t" : "neg-t"}>{q.voted_up ? t.ev_up : t.ev_down}</span>{q.playtime_h != null && <span>{q.playtime_h}시간</span>}</div>
                        {q.original}
                        {q.korean && <div className="ko">{q.korean} <span className="muted">{t.quotes_ai_tr}</span></div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="callout"><h3>{t.ai_none_title}</h3><p>{t.ai_none_body}</p></div>
          )}
        </div>
      )}

      {tab === "lang" && (
        <div className="stack">
          <div className="callout warn"><h3>{t.lang_warn_title}</h3><p>{t.lang_notice}</p></div>
          <div className="grid2c">
            <div className="card"><h3>{t.chart_lang_share}</h3><Donut items={donutItems} /></div>
            <div className="card"><h3>{t.chart_lang_rate}</h3>
              <RateDots refRate={s.all?.rate ?? s.official.rate} refLabel={t.chart_lang_all}
                rows={(s.languages as any[]).filter((l) => l.all.total >= 30).slice(0, 10).map((l) => row(noEmoji(l.name), l.all, N(l.all.total)))} />
              <p className="help">{t.chart_lang_rate_help}</p></div>
          </div>
          <div className="card">
            <h2>{t.lang_table_title}</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>{t.lang_col_lang}</th><th>{t.lang_col_share}</th><th>{t.lang_col_all}</th><th>{wl}</th><th>{t.lang_col_prev}</th><th>{t.lang_col_sample}</th></tr></thead>
                <tbody>
                  {s.languages.slice(0, 14).map((l: any) => (
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
          </div>
          <div className="card">
            <h2>{t.grp_title}</h2>
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
          {ai?.language_notes?.length > 0 && (
            <div className="stack">
              <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>{t.ai_lang_title}</h2><span>{t.ai_lang_sub}</span></div>
              <div className="grid2">
                {ai.language_notes.map((n: any) => (
                  <div key={n.language_code} className="theme">
                    <div className="top"><b>{noEmoji(n.name)}</b><span className="share">{fill(t.note_basis, { n: String(n.sample_n) })}</span></div>
                    <p>{n.summary}</p>
                    <Evidence t={t} ids={n.review_ids} ev={ev} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "play" && (
        !pt ? (
          <div className="callout warn"><h3>{t.play_none_title}</h3><p>{fill(t.play_none_body, { pct: (s.profile.playtime_coverage * 100).toFixed(1) })}</p></div>
        ) : (
        <div className="stack">
          <div className="callout"><h3>{t.play_title}</h3>
            <p>{fill(t.play_body, { b1: String(pt.bounds[0]), b2: String(pt.bounds[1]), b3: String(pt.bounds[2]), n: num(pt.reviewers) })}</p></div>
          <div className="grid2c">
            <div className="card"><h3>{t.chart_play_share}</h3>
              <PairBars aLabel={t.chart_play_a} bLabel={wl} rows={s.segments.map((g: any) => ({ label: g.label, sub: g.range, a: g.share_all, b: g.share_window }))} /></div>
            <div className="card"><h3>{fill(t.chart_play_rate, { label: wl })}</h3>
              <RateDots refRate={s.recent.rate} refLabel={wl} rows={s.segments.map((g: any) => row(g.label, g.window, g.range))} />
              <p className="help">{t.chart_help}</p></div>
          </div>
          <div className="card">
            <h2>{t.seg_title}</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>{t.seg_col_seg}</th><th>{t.seg_col_share}<div className="muted small" style={{ fontWeight: 400 }}>{fill(t.seg_col_share_sub, { label: wl })}</div></th><th>{fill(t.seg_col_window, { label: wl })}</th><th>{t.seg_col_all}</th></tr></thead>
                <tbody>
                  {s.segments.map((g: any) => (
                    <tr key={g.key}>
                      <td><b>{g.label}</b><div className="muted small">{g.range}</div></td>
                      <td className="num">{g.share_all.toFixed(0)}% → <b>{g.share_window.toFixed(0)}%</b></td>
                      <td><Rate r={g.window} /><div className="muted small">{N(g.window.total)}{!g.window.reliable ? ` · ${t.small_sample}` : ""}</div><PosNegBar pos={g.window.pos} neg={g.window.neg} /></td>
                      <td><Rate r={g.all} /><div className="muted small">{N(g.all.total)}</div><PosNegBar pos={g.all.pos} neg={g.all.neg} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="help">{t.seg_help}</p>
          </div>
          {ai?.segment_notes?.length > 0 && (
            <div className="grid2">
              {ai.segment_notes.map((n: any) => {
                const seg = s.segments.find((g: any) => g.key === n.segment_key);
                return (
                  <div key={n.segment_key} className="theme">
                    <div className="top"><b>{seg?.label} ({seg?.range})</b><span className="share">{fill(t.note_basis, { n: String(n.sample_n) })}</span></div>
                    <p>{n.summary}</p>
                    <Evidence t={t} ids={n.review_ids} ev={ev} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )
      )}

      {tab === "chg" && (
        <div className="stack">
          <div className="card">
            <h2>{t.chg_title}</h2>
            {s.previous ? (
              <div className="cmp">
                <div className="r"><span>{fill(t.chg_prev, { days: String(s.window.days) })}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${s.previous.rate}%` }} /></div><span className="num">{pct1(s.previous.rate)}</span></div>
                <div className="r"><span>{wl}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${s.recent.rate}%` }} /></div><span className="num">{pct1(s.recent.rate)}</span></div>
              </div>
            ) : <p className="muted">{t.chg_none}</p>}
            {s.delta_points != null && <p className="help">{fill(t.chg_diff, { diff: signed(s.delta_points) })} {s.delta_notable ? (noise != null ? fill(t.chg_notable_n, { noise: nz }) : t.chg_notable) : (noise != null ? fill(t.chg_calm_n, { noise: nz }) : t.chg_calm)}</p>}
            <p className="help">{s.window.reason}</p>
          </div>
          {ai?.change_notes?.length > 0 && (
            <div className="callout ai"><h3>{t.chg_ai_title}</h3>
              <ul>{ai.change_notes.map((c: any, i: number) => <li key={i}>{c.text}{c.review_ids?.length > 0 && <Evidence t={t} ids={c.review_ids} ev={ev} />}</li>)}</ul></div>
          )}
          <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>{t.news_title}</h2><span>{t.news_sub}</span></div>
          {news.length === 0 ? <div className="empty">{t.news_empty}</div> : (
            <div className="stack">
              {news.map((n: any, i: number) => {
                const note = ai?.news_notes?.find((x: any) => x.title && n.title.startsWith(x.title.slice(0, 20))) ?? ai?.news_notes?.[i];
                return (
                  <div key={i} className="theme">
                    <div className="top"><b>{n.title}</b><span className="share">{n.date}</span></div>
                    {note?.summary && <p>{note.summary} <span className="ai-tag">{t.news_ai}</span></p>}
                    <a href={n.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>{t.news_link}</a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "how" && (
        <div className="stack">
          <div className="card method">
            <h2>{t.how_title}</h2>
            <Bullets text={fill(t.how_body, { method: s.sample?.method ?? "" })} />
          </div>
          <div className="card">
            <h3>{fill(t.how_sample_title, { n: num(sampleTotal) })}</h3>
            <div className="tbl-wrap"><table>
              <thead><tr><th>{t.how_sample_col1}</th><th className="n">{t.how_sample_col2}</th><th className="n">{t.how_sample_col3}</th></tr></thead>
              <tbody>{(s.sample?.languages ?? []).map((x: any) => <tr key={x.code}><td>{noEmoji(x.name)}</td><td className="n num">{x.n}</td><td className="n num">{num(x.window_total)}</td></tr>)}</tbody>
            </table></div>
          </div>
          {ai && (
            <div className="card method">
              <h3>{t.how_ai_title}</h3>
              <ul>
                <li>{fill(t.how_model, { model: ai.model })}</li>
                <li>{fill(t.how_dropped, { a: String(ai.dropped?.unknown_ids ?? 0), b: String(ai.dropped?.empty_themes ?? 0) })}</li>
                {ai.caveats?.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          <p className="muted small">{fill(t.how_fetched, { time: dateKo(s.fetched_at, true), v: String(a.method_version) })}{admin ? ` · ID ${a.id}` : ""}</p>
        </div>
      )}
    </div>
  );
}
