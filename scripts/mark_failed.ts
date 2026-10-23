/** 아직 진행 중으로 남아 있는 분석을 실패로 정리합니다.   npx tsx scripts/mark_failed.ts <분석 ID> "<사유>"   (GitHub Actions 가 비정상 종료 때 호출) */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const [id, reason] = process.argv.slice(2);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { console.error("사용법: mark_failed.ts <분석 ID> <사유>"); process.exit(1); }
  const { failIfActive } = await import("../src/lib/repo");
  const { sql } = await import("../src/lib/db");
  const changed = await failIfActive(id, reason || "분석이 중단되었습니다.");
  console.log(changed ? "진행 중이던 분석을 실패로 정리했습니다." : "이미 끝난 분석이라 그대로 둡니다.");
  await sql.end({ timeout: 2 });
}
main();
