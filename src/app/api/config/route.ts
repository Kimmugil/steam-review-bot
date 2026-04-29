import { NextResponse } from "next/server";
import { getConfig } from "@/lib/sheets";
import { unstable_cache } from "next/cache";

const getCachedConfig = unstable_cache(() => getConfig(), ["site_config"], { revalidate: 300 });

export async function GET() {
  const config = await getCachedConfig();
  const marqueeSpeedPerCard = Number(config["marquee.speed_per_card"] ?? 10);
  return NextResponse.json(
    { marqueeSpeedPerCard },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
  );
}
