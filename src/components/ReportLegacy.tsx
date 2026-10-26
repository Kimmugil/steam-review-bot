"use client";
import Link from "next/link";
import HistoryPicker from "./HistoryPicker";
import { RatingPill, Thumb } from "./ui";
import { dateKo, fill, noEmoji, num } from "@/lib/format";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const list = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);

/** 예전 방식(구글 시트 시절)으로 만든 리포트. 모양이 다른 옛 자료를 있는 그대로, 방식이 달랐다는 안내와 함께 보여 줍니다. */
export default function ReportLegacy({ a, texts: t, versions = [] }: { a: any; texts: Texts; versions?: any[] }) {
  const s = a.stats ?? {}, ai = a.ai ?? {}, n = a.news ?? {};
  const rows: any[] = Array.isArray(s.table_data_all) ? s.table_data_all.slice(0, 10) : [];
  return (
    <div className="stack">
      <Link href="/" className="back">{t.back_list}</Link>
      <div className="callout warn"><h3>{t.legacy_title}</h3><p>{t.legacy_notice}</p></div>
      <div className="rhead">
        <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="xl" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>{a.game_name}</h1>
          <div className="meta"><span>{fill(t.rp_analyzed, { date: dateKo(a.finished_at, true) })}</span>{s.collection_period && <span>수집 기간 {s.collection_period}</span>}{a.release_date && <span>출시 {String(a.release_date).slice(0, 10)}</span>}
            <a href={`https://store.steampowered.com/app/${a.app_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t.rp_store}</a></div>
          {ai.critic_one_liner && <p className="one">{ai.critic_one_liner}</p>}
          <HistoryPicker currentId={a.id} items={versions} label={t.hist_label} />
        </div>
      </div>
      <div className="kpi4">
        <div className="kcard"><div className="k">{t.legacy_k_official}</div><div className="l"><RatingPill label={s.official_desc} /></div><div className="s">{t.legacy_k_official_sub}</div></div>
        <div className="kcard"><div className="k">{t.legacy_k_all}</div><div className="l"><RatingPill label={s.all_desc} /></div><div className="s">{fill(t.num_reviews, { n: num(s.all_total) })}</div></div>
        <div className="kcard"><div className="k">{fill(t.legacy_k_recent, { label: a.recent_label ?? t.card_recent_default })}</div><div className="l"><RatingPill label={s.recent_desc} /></div><div className="s">{fill(t.legacy_k_recent_sub, { n: num(s.recent_total) })}</div></div>
      </div>
      {ai.sentiment_analysis && <div className="callout ai"><h3>{t.legacy_ai}</h3><p>{ai.sentiment_analysis}</p></div>}
      <div className="grid2">
        {[[t.legacy_sec_all, list(ai.final_summary_all)], [t.legacy_sec_recent, list(ai.final_summary_recent)], [t.legacy_sec_issue, list(ai.ai_issue_pick)], [t.legacy_sec_news, list(ai.news_summary)]].map(([title, items]) =>
          (items as string[]).length ? (
            <div key={title as string} className="card"><h3>{title as string}</h3><ul className="bullets">{(items as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ) : null)}
      </div>
      {n?.title && <div className="card"><h3>{t.legacy_news_title}</h3><p>{n.title}</p><p className="help">{t.legacy_news_note}</p></div>}
      {rows.length > 0 && (
        <div className="card">
          <h3>{t.legacy_lang_title}</h3>
          <div className="tbl-wrap"><table>
            <thead><tr><th>언어</th><th className="n">리뷰 수</th><th className="n">비중</th><th className="n">긍정</th><th>평가</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{noEmoji(r.lang_with_flag)}</td><td className="n num">{num(r.count)}</td><td className="n num">{r.ratio}</td><td className="n num">{r.pos_ratio}</td><td><RatingPill label={r.eval} /></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
