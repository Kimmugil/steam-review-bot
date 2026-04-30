import { NextResponse } from "next/server";
import { getDailyUsage, setDailyUsageCount, getConfig, getTodayKST } from "@/lib/sheets";

async function verifyAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const password = auth.replace("Bearer ", "");
  const config = await getConfig();
  return password === config["admin_password"];
}

export async function GET(req: Request) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await getConfig();
  const usage = await getDailyUsage();
  const limit = Number(config["daily_limit"] ?? 30);
  return NextResponse.json({ date: usage.date, used: usage.count, limit });
}

export async function POST(req: Request) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const today = getTodayKST();

  if (body.action === "reset") {
    await setDailyUsageCount(today, 0);
    return NextResponse.json({ ok: true, message: "초기화됐습니다." });
  }
  if (body.action === "set_count" && typeof body.value === "number") {
    await setDailyUsageCount(today, body.value);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
