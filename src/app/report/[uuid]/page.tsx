import { getReportFromSheets } from "@/lib/sheets";
import ReportView from "@/components/report/ReportView";
import { notFound } from "next/navigation";

interface Props {
  params: { uuid: string };
}

export async function generateMetadata({ params }: Props) {
  const report = await getReportFromSheets(params.uuid);
  if (!report) return { title: "리포트 없음" };
  return {
    title: `${report.game_name} 분석 리포트 | 스팀 리뷰 탈곡기`,
    description: `${report.game_name} 스팀 유저 리뷰 분석 — ${report.store_stats.all_desc}`,
  };
}

export default async function ReportPage({ params }: Props) {
  const report = await getReportFromSheets(params.uuid);
  if (!report) notFound();
  return <ReportView report={report} />;
}
