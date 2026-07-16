import { NextResponse } from "next/server";
import { getAllReports } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = await getAllReports();
  return NextResponse.json(reports);
}
