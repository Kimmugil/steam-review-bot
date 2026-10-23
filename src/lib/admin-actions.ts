import { NextResponse } from "next/server";
import { isAdmin } from "./auth";

/** 관리자 API 공통 관문: 로그인하지 않았으면 401 */
export async function guard(): Promise<NextResponse | null> {
  return (await isAdmin()) ? null : NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
}
