"use client";
import Link from "next/link";
import HistoryPicker from "./HistoryPicker";
import { RatingPill, Thumb } from "./ui";
import { dateKo, num } from "@/lib/format";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const list = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);

/** 예전 방식(구글 시트 시절)으로 만든 리포트. 모양이 다른 옛 자료를 있는 그대로, 방식이 달랐다는 안내와 함께 보여 줍니다. */
export default function ReportLegacy({ a, texts: t, versions = [] }: { a: any; texts: Texts; versions?: any[] }) {
  const s = a.stats ?? {}, ai = a.ai ?? {}, n = a.news ?? {};
  const rows: any[] = Array.isArray(s.table_data_all) ? s.table_data_all.slice(0, 10) : [];
  return (
    <div className="stack">
      <Link href="/" className="back">← 목록으로</Link>
      <div className="callout warn"><h3>예전 방식으로 만든 리포트</h3><p>{t.legacy_notice}</p></div>
      <div className="rhead">
        <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="xl" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>{a.game_name}</h1>
          <div className="meta"><span>분석 {dateKo(a.finished_at, true)}</span>{s.collection_period && <span>수집 기간 {s.collection_period}</span>}{a.release_date && <span>출시 {String(a.release_date).slice(0, 10)}</span>}
            <a href={`https://store.steampowered.com/app/${a.app_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>스팀 상점 ↗</a></div>
          {ai.critic_one_liner && <p className="one">{ai.critic_one_liner}</p>}
          <HistoryPicker currentId={a.id} items={versions} />
        </div>
      </div>
      <div className="kpi4">
        <div className="kcard"><div className="k">당시 '공식 평가'로 표시한 값</div><div className="l"><RatingPill label={s.official_desc} /></div><div className="s">스토어 화면에서 읽어 온 값이라 최근 평가였을 수 있어요</div></div>
        <div className="kcard"><div className="k">전체 평가</div><div className="l"><RatingPill label={s.all_desc} /></div><div className="s">{num(s.all_total)}건</div></div>
        <div className="kcard"><div className="k">{a.recent_label ?? "최근"} 평가</div><div className="l"><RatingPill label={s.recent_desc} /></div><div className="s">표본 {num(s.recent_total)}건</div></div>
      </div>
      {ai.sentiment_analysis && <div className="callout ai"><h3>당시 AI 코멘트</h3><p>{ai.sentiment_analysis}</p></div>}
      <div className="grid2">
        {[["전체 여론 (당시)", list(ai.final_summary_all)], ["최근 여론 (당시)", list(ai.final_summary_recent)], ["이슈 (당시)", list(ai.ai_issue_pick)], ["공지 요약 (당시)", list(ai.news_summary)]].map(([title, items]) =>
          (items as string[]).length ? (
            <div key={title as string} className="card"><h3>{title as string}</h3><ul className="bullets">{(items as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ) : null)}
      </div>
      {n?.title && <div className="card"><h3>당시 선택된 소식</h3><p>{n.title}</p><p className="help">예전 방식은 개발사 공지가 아닌 언론 기사도 소식으로 가져왔어요.</p></div>}
      {rows.length > 0 && (
        <div className="card">
          <h3>언어별 비중 (당시 표)</h3>
          <div className="tbl-wrap"><table>
            <thead><tr><th>언어</th><th className="n">리뷰 수</th><th className="n">비중</th><th className="n">긍정</th><th>평가</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{r.lang_with_flag}</td><td className="n num">{num(r.count)}</td><td className="n num">{r.ratio}</td><td className="n num">{r.pos_ratio}</td><td><RatingPill label={r.eval} /></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
