import { NextRequest, NextResponse } from "next/server";
import { getConfig, setReportHidden, deleteReportFromIndex } from "@/lib/sheets";

async function verifyAuth(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const config = await getConfig();
  return password === (config.admin_password ?? "admin1234");
}

// PATCH /api/admin/reports/[uuid] — hide or show
export async function PATCH(
  req: NextRequest,
  { params }: { params: { uuid: string } }
) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { hidden } = await req.json() as { hidden: boolean };
  const ok = await setReportHidden(params.uuid, hidden);
  if (!ok) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/reports/[uuid] — remove from index
export async function DELETE(
  req: NextRequest,
  { params }: { params: { uuid: string } }
) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const ok = await deleteReportFromIndex(params.uuid);
  if (!ok) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
