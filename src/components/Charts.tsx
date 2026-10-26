/** 리포트용 간단한 그래프 (외부 라이브러리 없이 SVG·CSS로 그림). 색은 사이트 색 변수를 따라 어두운 화면에서도 보입니다. */
const PALETTE = ["var(--accent)", "var(--cool)", "var(--good)", "var(--warn)", "var(--bad)", "#8a6bbf", "var(--muted)"];

export type Slice = { label: string; value: number };

/** 도넛 그래프: 각 조각의 비율과 이름을 오른쪽 범례로 보여 줌 */
export function Donut({ items, center }: { items: Slice[]; center?: string }) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const R = 15.9155; // 둘레 100
  let acc = 0;
  return (
    <div className="chart-donut">
      <svg viewBox="0 0 42 42" width="150" height="150" role="img" aria-label={items.map((i) => `${i.label} ${((100 * i.value) / total).toFixed(0)}%`).join(", ")}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        {items.map((it, i) => {
          const len = (100 * it.value) / total;
          const el = <circle key={i} cx="21" cy="21" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="6" strokeDasharray={`${Math.max(0, len - 0.4)} ${100 - Math.max(0, len - 0.4)}`} strokeDashoffset={25 - acc} />;
          acc += len;
          return el;
        })}
        {center && <text x="21" y="22.5" textAnchor="middle" fontSize="4.2" fill="var(--ink)" fontWeight="700">{center}</text>}
      </svg>
      <ul className="legend">
        {items.map((it, i) => (
          <li key={i}><i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{it.label}</span><b className="num">{((100 * it.value) / total).toFixed(0)}%</b></li>
        ))}
      </ul>
    </div>
  );
}

export type RateRow = { label: string; sub?: string; rate: number | null; lo?: number | null; hi?: number | null; n?: number };

/** 긍정률 점 그래프: 점은 긍정률, 가로 막대는 95% 범위. 점선은 기준값(예: 스팀 상점 전체 평가) */
export function RateDots({ rows, refRate, refLabel }: { rows: RateRow[]; refRate?: number | null; refLabel?: string }) {
  const ok = rows.filter((r) => r.rate != null);
  if (!ok.length) return null;
  const lows = ok.map((r) => r.lo ?? r.rate!), highs = ok.map((r) => r.hi ?? r.rate!);
  if (refRate != null) { lows.push(refRate); highs.push(refRate); }
  const min = Math.max(0, Math.floor((Math.min(...lows) - 4) / 5) * 5), max = Math.min(100, Math.ceil((Math.max(...highs) + 4) / 5) * 5);
  const span = Math.max(10, max - min), at = (v: number) => `${(100 * (v - min)) / span}%`;
  const color = (v: number) => (v >= 70 ? "var(--good)" : v >= 40 ? "var(--warn)" : "var(--bad)");
  const ticks = [min, min + span / 2, min + span];
  return (
    <div className="chart-dots" role="img" aria-label={ok.map((r) => `${r.label} ${r.rate!.toFixed(1)}%`).join(", ")}>
      {rows.map((r, i) => (
        <div key={i} className="rowx">
          <div className="lbl"><b>{r.label}</b>{r.sub && <span className="muted small">{r.sub}</span>}</div>
          <div className="track">
            {refRate != null && <u style={{ left: at(refRate) }} />}
            {r.rate != null && r.lo != null && r.hi != null && <s style={{ left: at(r.lo), width: `${(100 * (r.hi - r.lo)) / span}%`, background: color(r.rate) }} />}
            {r.rate != null && <em style={{ left: at(r.rate), background: color(r.rate) }} />}
          </div>
          <div className="val num">{r.rate != null ? `${r.rate.toFixed(1)}%` : "-"}</div>
        </div>
      ))}
      <div className="rowx axis"><div className="lbl" /><div className="track ticks">{ticks.map((v, i) => <span key={i} style={{ left: at(v) }}>{Math.round(v)}%</span>)}</div><div className="val" /></div>
      {refRate != null && refLabel && <div className="muted small" style={{ marginTop: 4 }}>{refLabel} ({refRate.toFixed(1)}%)</div>}
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
