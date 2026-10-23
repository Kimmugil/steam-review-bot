import { spawn } from "node:child_process";

/** GitHub Actions 에 분석 실행을 요청합니다. (토큰·저장소 이름은 환경변수) */
export async function dispatchAnalysis(analysisId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  // 내 컴퓨터에서 시험할 때만: LOCAL_RUN_ANALYSIS=1 이면 GitHub 대신 이 컴퓨터에서 바로 분석을 돌립니다. (운영 환경에서는 동작하지 않음)
  if (process.env.LOCAL_RUN_ANALYSIS === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    if (!/^[0-9a-f-]{36}$/i.test(analysisId)) return { ok: false, message: "잘못된 분석 번호입니다." };
    spawn(process.execPath, ["--import", "tsx", "scripts/run_analysis.ts", analysisId], { cwd: process.cwd(), stdio: "ignore", detached: true }).unref();
    return { ok: true };
  }
  const token = process.env.GITHUB_PAT ?? process.env.GH_PAT ?? process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "Kimmugil/steam-review-bot";
  const ref = process.env.GITHUB_REF_NAME ?? "main";    // 미리보기(v2 가지)에서는 GITHUB_REF_NAME=v2
  if (!token) return { ok: false, message: "분석 실행기(GitHub)가 아직 연결되지 않았습니다. 관리자에게 알려 주세요." };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/analyze-report.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref, inputs: { analysis_id: analysisId } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 204) return { ok: true };
    return { ok: false, message: `분석 실행기를 깨우지 못했습니다 (코드 ${r.status}). 토큰 권한·만료를 확인해 주세요.` };
  } catch {
    return { ok: false, message: "분석 실행기에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
