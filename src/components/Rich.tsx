import { Fragment } from "react";

/** **굵게** 표시만 지원하는 가벼운 문구 렌더러 (관리자가 고친 문구용) */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** 줄마다 한 항목으로 나누어 목록으로 */
export function Bullets({ text }: { text: string }) {
  return <ul>{text.split("\n").filter((l) => l.trim()).map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>;
}

/** 줄마다 한 문단으로 */
export function Paras({ text }: { text: string }) {
  return <>{text.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i}><Rich text={l} /></p>)}</>;
}
