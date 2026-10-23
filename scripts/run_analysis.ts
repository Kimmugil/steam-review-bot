/**
 * 분석 한 건 실행.   npx tsx scripts/run_analysis.ts <분석 ID>
 *   - GitHub Actions 가 웹 요청마다 호출합니다.
 *   - 내 컴퓨터에서 시험할 때는 새 분석을 만들어 바로 돌릴 수도 있습니다:  npx tsx scripts/run_analysis.ts --new <App ID>
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { runAnalysis } = await import("../src/lib/analysis");
  const { createRequest } = await import("../src/lib/repo");
  const { sql } = await import("../src/lib/db");
  const args = process.argv.slice(2);
  let id = args[0];
  if (args[0] === "--new") {
    const appId = Number(args[1]);
    if (!Number.isInteger(appId)) { console.error("사용법: --new <App ID>"); process.exit(1); }
    const r = await createRequest({ appId, name: String(appId), headerImage: null, releaseDate: null, via: "admin", requesterHash: null });
    if (r.kind === "active") { console.log("이미 진행 중인 분석이 있습니다:", r.analysis.id); await sql.end(); return; }
    if (r.kind !== "created") { console.error("접수하지 못했습니다:", r.kind); process.exit(1); }
    id = r.id;
    console.log("새 분석 접수:", id);
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { console.error("사용법: run_analysis.ts <분석 ID>  |  --new <App ID>"); process.exit(1); }
  try {
    await runAnalysis(id);
    console.log("완료:", id);
  } catch {
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
main();
