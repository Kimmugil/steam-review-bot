import { headers } from "next/headers";

/** 아주 단순한 요청 횟수 제한 (서버 인스턴스 메모리 기준). 남용을 줄이는 용도이며 완벽한 방어는 아닙니다. */
const hits = new Map<string, number[]>();

export async function limited(bucket: string, max: number, windowSec: number): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowSec * 1000)) hits.delete(k);
  return arr.length > max;
}
