"use client";
import Link from "next/link";
import { useState } from "react";
import { Pill, PosNegBar, RatingPill, Thumb } from "./ui";
import { dateKo, num, pct1, signed } from "@/lib/format";
import { langName } from "@/lib/config";
import type { Texts } from "@/lib/text-defs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = Record<number, { lang: string; voted_up: boolean; playtime_h: number | null; text: string }>;

function Rate({ r }: { r: any }) {
  if (!r || r.rate == null) return <span className="muted">-</span>;
  return <><b className="num">{pct1(r.rate)}</b> <span className="ci">({pct1(r.ci?.[0])}~{pct1(r.ci?.[1])})</span></>;
}

function Evidence({ ids, ev, label = "근거 리뷰" }: { ids: number[]; ev: Ev; label?: string }) {
  const list = ids.map((n) => ({ n, ...ev[n] })).filter((x) => x.text);
  if (!list.length) return null;
  return (
    <details className="ev">
      <summary>{label} {list.length}건 보기</summary>
      <div className="rvs">
        {list.map((r) => (
          <div key={r.n} className="rv2">
            <div className="m"><span>R{r.n}</span><span>{langName(r.lang)}</span><span className={r.voted_up ? "pos-t" : "neg-t"}>{r.voted_up ? "👍 추천" : "👎 비추천"}</span>{r.playtime_h != null && <span>{r.playtime_h}시간</span>}</div>
            {r.text}
          </div>
        ))}
      </div>
    </details>
  );
}

function KCard({ k, label, r, sub }: { k: string; label?: string; r: any; sub?: React.ReactNode }) {
  return (
    <div className="kcard">
      <div className="k">{k}</div>
      <div className="v">{r.rate != null ? pct1(r.rate) : "-"}</div>
      <div className="l"><RatingPill label={label ?? r.label} /></div>
      <div className="s">{num(r.total)}건{r.ci ? ` · 95% 범위 ${pct1(r.ci[0])}~${pct1(r.ci[1])}` : ""}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

const TABS = [["sum", "요약"], ["lang", "언어별"], ["play", "플레이타임"], ["chg", "변화·소식"], ["how", "방법·한계"]] as const;

export default function ReportV2({ a, stats: s, ai, news, ev, texts: t, admin }: { a: any; stats: any; ai: any; news: any[]; ev: Ev; texts: Texts; admin?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("sum");
  const sampleTotal = s.sample?.total ?? 0;
  const langN = (code: string) => s.sample?.languages?.find((x: any) => x.code === code)?.n ?? 0;
  return (
    <div className="stack">
      <Link href="/" className="back">← 목록으로</Link>
      <div className="rhead">
        <Thumb appid={Number(a.app_id)} name={a.game_name} src={a.header_image} size="xl" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>{a.game_name}</h1>
          <div className="meta">
            <span>분석 {dateKo(a.finished_at, true)}</span>
            <span>분석 기간 {s.window.start} ~ {s.window.end} ({s.window.label})</span>
            {a.release_date && <span>출시 {String(a.release_date).slice(0, 10)}</span>}
            <a href={`https://store.steampowered.com/app/${a.app_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>스팀 상점 ↗</a>
          </div>
          {ai?.one_liner && <p className="one">{ai.one_liner}</p>}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "sum" && (
        <div className="stack">
          <div className="kpi4">
            <KCard k="스팀 상점 평가 (전체 기간)" r={s.official} label={s.official.steam_label ?? s.official.label} sub="스팀 구매만 · 모든 언어" />
            <KCard k={`${s.window.label} 평가`} r={s.recent} sub={s.delta_points != null ? <>직전 {s.window.days}일 대비 <b className={s.delta_significant ? (s.delta_points >= 0 ? "up" : "down") : "flat"}>{signed(s.delta_points)}</b> {s.delta_significant ? "(뚜렷한 변화)" : "(작은 변화, 우연일 수 있음)"}</> : "비교할 직전 기간 없음"} />
            <KCard k="스팀 밖 구매까지 포함한 전체" r={s.all} sub="키 구매 등 포함" />
          </div>

          {s.highlights?.length > 0 && (
            <div className="callout">
              <h3>숫자로 본 핵심 <span className="muted" style={{ fontWeight: 400 }}>· 코드가 숫자에서 찾은 사실</span></h3>
              <ul>{s.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}

          {s.data_notes?.length > 0 && (
            <div className="callout warn"><h3>읽기 전에 알아 둘 점</h3><ul>{s.data_notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>
          )}

          {ai ? (
            <>
              <div className="callout ai">
                <h3>AI 해석 <span className="muted" style={{ fontWeight: 400 }}>· {t.ai_notice}</span></h3>
                <p>{ai.headline}</p>
              </div>
              <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>리뷰에서 보이는 주제</h2><span>표본 {num(sampleTotal)}건 안에서의 비중이에요</span></div>
              <div className="themes">
                {ai.themes.length === 0 && <div className="empty">표본에서 뚜렷한 주제를 찾지 못했어요.</div>}
                {ai.themes.map((th: any, i: number) => (
                  <div key={i} className="theme">
                    <div className="top">
                      <Pill cls={th.polarity === "positive" ? "good" : th.polarity === "negative" ? "bad" : "warn"} title="AI가 판단한 주제의 성격">{th.polarity === "positive" ? "좋았던 점" : th.polarity === "negative" ? "아쉬운 점" : "엇갈려요"}</Pill>
                      <b>{th.label}</b>
                      <span className="share num">표본 {sampleTotal}건 중 {th.support}건 ({(th.support_share * 100).toFixed(0)}%)</span>
                    </div>
                    <div className="sbar"><i className={th.polarity === "positive" ? "pos" : th.polarity === "negative" ? "neg" : "mix"} style={{ width: `${Math.min(100, th.support_share * 100 * 3)}%` }} /></div>
                    <p>{th.summary}</p>
                    <div className="muted small">이 이야기를 한 리뷰 중 👍 추천 {(th.pos_share * 100).toFixed(0)}%{th.polarity === "negative" && th.stance === "recommend" ? " — 아쉬운 점을 말하면서도 대부분 추천한 리뷰예요" : th.polarity === "positive" && th.stance === "against" ? " — 좋은 점을 말하면서도 대부분 추천하지 않은 리뷰예요" : ""}</div>
                    <Evidence ids={th.review_ids} ev={ev} />
                  </div>
                ))}
              </div>
              {ai.quotes?.length > 0 && (
                <>
                  <div className="sec-title" style={{ margin: "8px 0 0" }}><h2>대표 리뷰</h2><span>원문은 스팀 리뷰 그대로, 한국어는 AI 번역이에요</span></div>
                  <div className="rvs">
                    {ai.quotes.map((q: any) => (
                      <div key={q.review_id} className="rv2">
                        <div className="m"><span>{langName(q.language)}</span><span className={q.voted_up ? "pos-t" : "neg-t"}>{q.voted_up ? "👍" : "👎"}</span>{q.playtime_h != null && <span>{q.playtime_h}시간</span>}</div>
                        {q.original}
                        {q.korean && <div className="ko">🇰🇷 {q.korean} <span className="muted">(AI 번역)</span></div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="callout"><h3>AI 해석 없음</h3><p>이 리포트는 숫자만 저장되었어요. 이유는 위 "읽기 전에 알아 둘 점"을 확인해 주세요.</p></div>
          )}
        </div>
      )}

      {tab === "lang" && (
        <div className="stack">
          <div className="callout warn"><h3>국가가 아니라 '언어' 기준이에요</h3><p>{t.lang_notice}</p></div>
          <div className="card">
            <h2>언어별 평가</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>언어</th><th>비중</th><th>전체 기간 긍정률</th><th>{s.window.label}</th><th>직전</th><th>표본</th></tr></thead>
                <tbody>
                  {s.languages.slice(0, 14).map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name}<div className="muted small">{num(l.all.total)}건</div></td>
                      <td><div className="langbar"><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, l.share)}%` }} /></div><span className="num">{l.share.toFixed(1)}%</span></div></td>
                      <td><Rate r={l.all} /> <RatingPill label={l.all.label} /></td>
                      <td>{l.window ? <><Rate r={l.window} /><div className="muted small">{num(l.window.total)}건</div></> : <span className="muted">-</span>}</td>
                      <td>{l.prev ? <span className="num">{pct1(l.prev.rate)}</span> : <span className="muted">-</span>}</td>
                      <td className="num">{langN(l.code) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="help">괄호는 95% 범위예요. 리뷰가 적을수록 범위가 넓어져요. 비중 1% 미만 언어는 표에서 뺐어요.</p>
          </div>
          <div className="card">
            <h2>언어권별 (언어를 묶은 것)</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>언어권</th><th>포함 언어</th><th>비중</th><th>전체 기간 긍정률</th></tr></thead>
                <tbody>
                  {s.groups.map((g: any) => (
                    <tr key={g.group}><td>{g.group}</td><td className="small muted">{g.languages.join(", ")}</td><td className="num">{g.share.toFixed(1)}%</td><td><Rate r={g.all} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {ai?.language_notes?.length > 0 && (
            <div className="stack">
              <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>언어별 AI 해석</h2><span>표본이 8건 이상인 언어만 · 표본 건수를 함께 표시해요</span></div>
              <div className="grid2">
                {ai.language_notes.map((n: any) => (
                  <div key={n.language_code} className="theme">
                    <div className="top"><b>{n.name}</b><span className="share">표본 {n.sample_n}건 기준</span></div>
                    <p>{n.summary}</p>
                    <Evidence ids={n.review_ids} ev={ev} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "play" && (
        <div className="stack">
          <div className="callout"><h3>플레이타임 구간은 모든 게임에 같은 기준이에요</h3><p>리뷰를 쓸 때까지의 플레이타임으로 나눴어요 (입문 2시간 이하 · 초반 2~10시간 · 중반 10~50시간 · 코어 50시간 초과). 게임마다 달라지는 '상대 순위'가 아니라서 게임끼리 비교할 수 있어요.</p></div>
          <div className="card">
            <h2>구간별 평가</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>구간</th><th>{s.window.label}</th><th>전체 기간</th></tr></thead>
                <tbody>
                  {s.segments.map((g: any) => (
                    <tr key={g.key}>
                      <td><b>{g.label}</b><div className="muted small">{g.range}</div></td>
                      <td><Rate r={g.window} /><div className="muted small">{num(g.window.total)}건</div><PosNegBar pos={g.window.pos} neg={g.window.neg} /></td>
                      <td><Rate r={g.all} /><div className="muted small">{num(g.all.total)}건</div><PosNegBar pos={g.all.pos} neg={g.all.neg} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {ai?.segment_notes?.length > 0 && (
            <div className="grid2">
              {ai.segment_notes.map((n: any) => {
                const seg = s.segments.find((g: any) => g.key === n.segment_key);
                return (
                  <div key={n.segment_key} className="theme">
                    <div className="top"><b>{seg?.label} ({seg?.range})</b><span className="share">표본 {n.sample_n}건 기준</span></div>
                    <p>{n.summary}</p>
                    <Evidence ids={n.review_ids} ev={ev} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "chg" && (
        <div className="stack">
          <div className="card">
            <h2>직전 기간과 비교</h2>
            {s.previous ? (
              <div className="cmp">
                <div className="r"><span>직전 {s.window.days}일</span><div className="bar-track"><div className="bar-fill" style={{ width: `${s.previous.rate}%` }} /></div><span className="num">{pct1(s.previous.rate)}</span></div>
                <div className="r"><span>{s.window.label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${s.recent.rate}%` }} /></div><span className="num">{pct1(s.recent.rate)}</span></div>
              </div>
            ) : <p className="muted">출시 직후라 비교할 직전 기간이 없어요.</p>}
            {s.delta_points != null && <p className="help">차이 {signed(s.delta_points)} — {s.delta_significant ? "표본 크기를 고려해도 우연으로 설명하기 어려운 변화예요." : "표본 크기를 고려하면 우연으로도 생길 수 있는 작은 차이예요."}</p>}
            <p className="help">{s.window.reason}</p>
          </div>
          {ai?.change_notes?.length > 0 && (
            <div className="callout ai"><h3>변화 해석 (AI)</h3>
              <ul>{ai.change_notes.map((c: any, i: number) => <li key={i}>{c.text}{c.review_ids?.length > 0 && <Evidence ids={c.review_ids} ev={ev} />}</li>)}</ul></div>
          )}
          <div className="sec-title" style={{ margin: "4px 0 0" }}><h2>개발사 공식 공지</h2><span>개발사가 스팀에 직접 올린 공지만 (언론 기사는 제외)</span></div>
          {news.length === 0 ? <div className="empty">최근 120일 안에 올라온 공식 공지가 없어요.</div> : (
            <div className="stack">
              {news.map((n: any, i: number) => {
                const note = ai?.news_notes?.find((x: any) => x.title && n.title.startsWith(x.title.slice(0, 20))) ?? ai?.news_notes?.[i];
                return (
                  <div key={i} className="theme">
                    <div className="top"><b>{n.title}</b><span className="share">{n.date}</span></div>
                    {note?.summary && <p>{note.summary} <span className="ai-tag">AI 요약</span></p>}
                    <a href={n.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>원문 보기 ↗</a>
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
            <h2>이 리포트는 이렇게 만들었어요</h2>
            <ul>
              <li><b>숫자</b>는 스팀에서 조건별 건수를 직접 받아 코드가 계산했어요 (전체·기간별·언어별·플레이타임별). AI는 숫자를 만들지 않아요.</li>
              <li><b>표본</b>: {s.sample?.method}</li>
              <li><b>AI</b>는 표본을 읽고 주제를 찾고, 근거가 되는 리뷰 번호만 가리켜요. 번호가 실제 있는지, 주제의 비중과 긍정/부정 성향은 코드가 근거 리뷰로 계산했어요.</li>
              <li>등급 이름(압도적으로 긍정적 등)은 스팀 상점의 구간 기준을 따르되 리뷰 수가 적으면 붙이지 않았어요. 괄호 속 범위는 95% 신뢰 구간이에요.</li>
              <li>이 분석은 <b>언어</b> 기준이에요. 국가가 아니에요.</li>
            </ul>
          </div>
          <div className="card">
            <h3>표본 구성 (총 {num(sampleTotal)}건)</h3>
            <div className="tbl-wrap"><table>
              <thead><tr><th>언어</th><th className="n">뽑은 표본</th><th className="n">분석 기간 전체 리뷰</th></tr></thead>
              <tbody>{(s.sample?.languages ?? []).map((x: any) => <tr key={x.code}><td>{x.name}</td><td className="n num">{x.n}</td><td className="n num">{num(x.window_total)}</td></tr>)}</tbody>
            </table></div>
          </div>
          {ai && (
            <div className="card method">
              <h3>AI 해석 점검</h3>
              <ul>
                <li>모델: {ai.model}</li>
                <li>AI가 가리킨 근거 번호 중 실제 표본에 없어 제외한 것: {ai.dropped?.unknown_ids ?? 0}개 · 근거가 2건 미만이라 버린 주제: {ai.dropped?.empty_themes ?? 0}개</li>
                {ai.caveats?.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          <p className="muted small">수치를 받은 시각 {dateKo(s.fetched_at, true)} · 분석 방법 버전 {a.method_version}{admin ? ` · ID ${a.id}` : ""}</p>
        </div>
      )}
    </div>
  );
}
