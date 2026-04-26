import { NextResponse } from "next/server";
import { getAllReports } from "@/lib/sheets";

export async function GET() {
  const reports = await getAllReports();
  return NextResponse.json(reports);
}
