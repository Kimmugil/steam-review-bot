import Link from "next/link";
import { notFound } from "next/navigation";
import ProgressView from "@/components/ProgressView";
import ReportLegacy from "@/components/ReportLegacy";
import ReportV2 from "@/components/ReportV2";
import { isAdmin } from "@/lib/auth";
import { getAnalysis, getSamplesByNo, reapStuck } from "@/lib/repo";
import { getTexts } from "@/lib/texts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAnalysis((await params).id).catch(() => null);
  return { title: a ? `${a.game_name} · 스팀 리뷰 탈곡기` : "스팀 리뷰 탈곡기" };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await reapStuck().catch(() => 0);
  const a = await getAnalysis(id);
  if (!a || (a.hidden && !(await isAdmin()))) notFound();
  const texts = await getTexts();

  if (a.status !== "done") return <ProgressView a={a} />;
  if (a.method_version === 1) return <ReportLegacy a={a} texts={texts} />;

  // AI가 근거로 가리킨 표본 번호의 원문만 불러옵니다 (화면으로 보내는 양을 줄이려고)
  const ai = a.ai;
  const cited = new Set<number>();
  for (const x of [...(ai?.themes ?? []), ...(ai?.language_notes ?? []), ...(ai?.segment_notes ?? []), ...(ai?.change_notes ?? [])]) for (const n of x.review_ids ?? []) cited.add(n);
  const rows = await getSamplesByNo(id, [...cited]);
  const ev = Object.fromEntries(rows.map((r) => [r.n, { lang: r.lang, voted_up: r.voted_up, playtime_h: r.playtime_h, text: r.text }]));

  return <ReportV2 a={a} stats={a.stats} ai={ai} news={a.news ?? []} ev={ev} texts={texts} admin={await isAdmin()} />;
}
