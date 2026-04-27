import { getReportFromSheets, getUiTexts } from "@/lib/sheets";
import ReportView from "@/components/report/ReportView";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";

interface Props {
  params: { uuid: string };
}

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });

export async function generateMetadata({ params }: Props) {
  const [report, t] = await Promise.all([getReportFromSheets(params.uuid), getCachedUiTexts()]);
  if (!report) return { title: "리포트 없음" };
  const appTitle = t.app_title ?? "스팀 리뷰 탈곡기";
  return {
    title: `${report.game_name} 분석 리포트 | ${appTitle}`,
    description: `${report.game_name} 스팀 유저 리뷰 분석 — ${report.store_stats.all_desc}`,
  };
}

export default async function ReportPage({ params }: Props) {
  const [report, t] = await Promise.all([getReportFromSheets(params.uuid), getCachedUiTexts()]);
  if (!report) notFound();
  return <ReportView report={report} texts={t} />;
}
