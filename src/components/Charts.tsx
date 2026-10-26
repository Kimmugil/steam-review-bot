/** 리포트용 간단한 그래프 (외부 라이브러리 없이 CSS로 그림). 색은 사이트 색 변수를 따라 어두운 화면에서도 보입니다. */

export type RateRow = { label: string; sub?: string; pos: number; neg: number; note?: string };

const pctOf = (r: { pos: number; neg: number }) => (r.pos + r.neg ? (100 * r.pos) / (r.pos + r.neg) : null);

/** 긍정·부정 막대: 막대 전체가 100%, 초록이 긍정. 오른쪽에 긍정률 숫자. 세로선은 기준값 */
export function RateBars({ rows, refRate }: { rows: RateRow[]; refRate?: number | null }) {
  return (
    <div className="chart-rate" role="img" aria-label={rows.map((r) => `${r.label} 긍정 ${pctOf(r)?.toFixed(1) ?? "-"}%`).join(", ")}>
      {rows.map((r, i) => {
        const p = pctOf(r);
        return (
          <div key={i} className="rowx">
            <div className="lbl"><b>{r.label}</b>{r.sub && <span className="muted small">{r.sub}</span>}</div>
            <div className="bar">
              {p != null ? <><i className="g" style={{ width: `${p}%` }} /><i className="r" style={{ width: `${100 - p}%` }} /></> : <span className="muted small">-</span>}
              {refRate != null && <u style={{ left: `${refRate}%` }} />}
            </div>
            <div className="val"><b className="num">{p != null ? `${p.toFixed(1)}%` : "-"}</b>{r.note && <span className="muted small">{r.note}</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

export type LangRow = { name: string; share: number; pos: number; neg: number };

/** 요약용 언어 한눈에: 왼쪽은 그 언어가 차지하는 비중, 오른쪽은 그 언어의 긍정·부정 비율 */
export function LangOverview({ rows, shareLabel, rateLabel }: { rows: LangRow[]; shareLabel: string; rateLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.share));
  return (
    <div className="chart-lang">
      <div className="rowx head muted small"><span /><span>{shareLabel}</span><span>{rateLabel}</span></div>
      {rows.map((r, i) => {
        const p = pctOf(r);
        return (
          <div key={i} className="rowx">
            <b>{r.name}</b>
            <div className="share"><i style={{ width: `${(100 * r.share) / max}%` }} /><span className="num">{r.share.toFixed(0)}%</span></div>
            <div className="bar">{p != null && <><i className="g" style={{ width: `${p}%` }} /><i className="r" style={{ width: `${100 - p}%` }} /></>}<em className="num">{p != null ? `${p.toFixed(0)}%` : "-"}</em></div>
          </div>
        );
      })}
    </div>
  );
}

export type PairRow = { label: string; sub?: string; a: number; b: number };

/** 두 값 나란히 막대: 전체 기간 비중 vs 분석 기간 비중 */
export function PairBars({ rows, aLabel, bLabel }: { rows: PairRow[]; aLabel: string; bLabel: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="chart-pairs">
      <div className="muted small legend2"><span><i style={{ background: "var(--cool)" }} />{aLabel}</span><span><i style={{ background: "var(--accent)" }} />{bLabel}</span></div>
      {rows.map((r, i) => (
        <div key={i} className="rowx">
          <div className="lbl"><b>{r.label}</b>{r.sub && <span className="muted small">{r.sub}</span>}</div>
          <div className="bars">
            <div><i style={{ width: `${(100 * r.a) / max}%`, background: "var(--cool)" }} /><span className="num">{r.a.toFixed(0)}%</span></div>
            <div><i style={{ width: `${(100 * r.b) / max}%`, background: "var(--accent)" }} /><span className="num">{r.b.toFixed(0)}%</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}
