import { NextRequest, NextResponse } from "next/server";
import { getConfig, getAllReportsAdmin } from "@/lib/sheets";

async function verifyAuth(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const config = await getConfig();
  return password === (config.admin_password ?? "admin1234");
}

export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const reports = await getAllReportsAdmin();
  return NextResponse.json(reports);
}
