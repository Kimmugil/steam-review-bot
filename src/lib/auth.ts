import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { sql } from "./db";

/**
 * 관리자 인증
 *  - 비밀번호는 어디에도 평문으로 저장하지 않습니다. 환경변수 ADMIN_PASSWORD_HASH 에 "해시"만 둡니다.
 *    (만드는 법: node scripts/hash-password.mjs)
 *  - 로그인하면 8시간짜리 서명된 출입증(쿠키)을 줍니다. 브라우저 스크립트는 이 쿠키를 읽을 수 없습니다(httpOnly).
 *  - 연속으로 틀리면 잠깁니다. 접속 주소는 해시로만 기록합니다.
 */
const COOKIE = "th_admin";
const SESSION_HOURS = 8;
const MAX_FAILS = 5;
const WINDOW_MIN = 15;

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 24) throw new Error("SESSION_SECRET 이 없거나 너무 짧습니다 (24자 이상).");
  return s;
}

export function verifyPassword(password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  const [scheme, saltHex, hashHex] = stored.split(/[$:]/); // ":" 형식이 기본 (.env의 $ 기호는 변수로 오해되어 사라질 수 있어서)
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function makeHash(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeToken(): { token: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  const payload = `v1.${exp}`;
  return { token: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

export function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  let good: Buffer, given: Buffer;
  try {
    good = Buffer.from(sign(payload), "hex");
    given = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  if (good.length !== given.length || !timingSafeEqual(good, given)) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}

export async function isAdmin(): Promise<boolean> {
  try {
    return tokenValid((await cookies()).get(COOKIE)?.value);
  } catch {
    return false;
  }
}

export const sessionCookie = { name: COOKIE };

export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  return createHash("sha256").update(ip + ":" + secret()).digest("hex").slice(0, 32);
}

/** 최근 15분간 연속 실패가 5번 이상이면 잠금 */
export async function isLocked(key: string): Promise<boolean> {
  const [r] = await sql`select count(*)::int as n from admin_login_attempts
                        where key = ${key} and not ok and at > now() - make_interval(mins => ${WINDOW_MIN})
                          and at > coalesce((select max(at) from admin_login_attempts where key = ${key} and ok), 'epoch')`;
  return r.n >= MAX_FAILS;
}

export async function recordAttempt(key: string, ok: boolean) {
  await sql`insert into admin_login_attempts (key, ok) values (${key}, ${ok})`;
  if (Math.random() < 0.05) await sql`delete from admin_login_attempts where at < now() - interval '7 days'`;
}
