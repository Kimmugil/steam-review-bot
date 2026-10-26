import postgres from "postgres";

/**
 * 데이터베이스 연결 (서버에서만 사용).
 * 전용 계정(thresher_app)의 기본 경로가 thresher 구역이라 표 이름만 쓰면 됩니다.
 *
 * ⚠ 접속 주소는 반드시 '세션 풀러'(포트 5432) 주소를 쓰세요.
 *   '트랜잭션 풀러'(포트 6543)는 질의가 연결 수보다 많이 동시에 몰리면(예: 한 화면에서 질의 5개) 연결 묶음 전체가 멈추고
 *   복구되지 않는 현상을 실험으로 확인했습니다(2026-10). 세션 풀러는 같은 조건에서 정상이었습니다.
 *   이 서비스는 요청이 많지 않아 세션 풀러의 연결 수 제한으로 충분합니다. (연결은 작게 쓰고, 놀면 곧 닫습니다)
 */
function connectionUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return "postgres://localhost:5432/missing"; // 빌드 때 환경변수가 없어도 죽지 않도록 (실제 질의 때 오류)
  return url;
}

declare global {
  // eslint-disable-next-line no-var
  var __th_sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__th_sql ??
  (globalThis.__th_sql = postgres(connectionUrl(), {
    prepare: false,         // 풀러 환경에서 이름 붙은 prepared statement 는 쓰지 않음
    fetch_types: false, // 시작 때 DB 유형 목록을 따로 조회하지 않음 (풀러에서 불필요한 왕복)
    max: 1,                 // 서버 인스턴스 하나당 연결 1개. 질의는 줄 세워 처리 (세션 풀러 총 한도가 15개라 여러 인스턴스가 4개씩 쓰면 금방 바닥남)
    idle_timeout: 3,        // 놀면 3초 뒤 닫아 풀러의 연결 자리를 돌려줌
    max_lifetime: 600,      // 한 연결을 10분 넘게 쓰지 않음
    connect_timeout: 15,
    types: { bigint: postgres.BigInt },
    ...(process.env.DB_DEBUG ? { debug: (_c: number, q: string) => console.log("[SQL]", q.replace(/\s+/g, " ").slice(0, 110)) } : {}),
  }));

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** postgres.js 가 돌려주는 bigint·Date 를 화면으로 넘길 수 있는 평범한 값으로 바꿉니다. */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x)));
}

/** 한국 날짜 (하루 한도의 기준). 자정(KST)에 새로 시작합니다. */
export function kstDay(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
