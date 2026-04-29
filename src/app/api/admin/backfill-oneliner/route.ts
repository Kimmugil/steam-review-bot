import { NextResponse } from "next/server";
import { backfillOneLiner, backfillHeaderImage, getConfig } from "@/lib/sheets";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  const config = await getConfig();
  if (password !== config["admin_password"]) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [oneliner, headerImg] = await Promise.all([backfillOneLiner(), backfillHeaderImage()]);
  return NextResponse.json({ ok: true, oneliner, headerImg });
}
