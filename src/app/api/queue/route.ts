import { NextResponse } from "next/server";
import { getPendingQueue } from "@/lib/sheets";

export const revalidate = 0; // Disable static caching

export async function GET() {
  try {
    const queue = await getPendingQueue();
    return NextResponse.json(queue);
  } catch (error: any) {
    console.error("Failed to fetch queue:", error);
    return NextResponse.json([], { status: 500 });
  }
}
