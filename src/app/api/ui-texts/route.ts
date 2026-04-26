import { NextResponse } from "next/server";
import { getUiTexts } from "@/lib/sheets";

export const revalidate = 300; // cache 5 minutes

export async function GET() {
  const texts = await getUiTexts();
  return NextResponse.json(texts);
}
