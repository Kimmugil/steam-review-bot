import { google } from "googleapis";
import { getLangName } from "./config";
import type { AnalysisReport, ReportIndex, RawReview, QAItem } from "./types";

const MASTER_SHEET_ID = process.env.GOOGLE_SHEETS_MASTER_ID ?? "";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}";
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

async function ensureTab(sheetsApi: ReturnType<typeof google.sheets>, spreadsheetId: string, tabName: string): Promise<void> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabName);
  if (!exists) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
  }
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbzOHTcqZAsvfiB53b2tmx8xdGQz5hI6F5GSvet6byYy1WJyH01vIZLb2prwqSZ2Y-PPVw/exec";

async function getOrCreateGameSheet(appId: string, gameName: string): Promise<string> {
  const sheetName = `[${appId}] ${gameName.slice(0, 50)}`;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}";
  let serviceAccountEmail = "";
  try { serviceAccountEmail = JSON.parse(raw).client_email || ""; } catch {}

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 2000));
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "1cMuannCe1rQGArv1vseTKtlTetg_U1Mr", fileName: sheetName, serviceAccountEmail }),
    });

    const rawText = await response.text();
    let data: { ok: boolean; spreadsheetId?: string; reused?: boolean; error?: string };
    try {
      data = JSON.parse(rawText);
    } catch {
      lastError = `GAS fetch failed (invalid JSON): ${rawText.slice(0, 300)}`;
      continue;
    }

    if (!data.ok || !data.spreadsheetId) {
      lastError = data.error ?? "spreadsheetId missing";
      continue;
    }
    return data.spreadsheetId;
  }
  throw new Error(`Failed to create spreadsheet after retries: ${lastError}`);
}

// ── Tab header definitions ──────────────────────────────────────────────────
const LIST_HEADER = [
  "UUID", "분석시각", "앱ID", "게임명", "수집기간", "릴리즈일",
  "공식평가", "전체평가", "전체리뷰수", "최근평가", "최근리뷰수",
  "뉴비평균PT(h)", "뉴비표본수", "뉴비평가",
  "일반평균PT(h)", "일반표본수", "일반평가",
  "코어평균PT(h)", "코어표본수", "코어평가",
  "플레이타임표본수", "AI한줄평", "종합여론",
];

const DETAIL_HEADER = [
  "UUID", "분석시각", "앱ID", "게임명", "release_date", "recent_label",
  "smart_reason", "header_image", "store_stats", "ai_data", "news_data",
];

const RAW_HEADER = [
  "UUID", "분석시각", "언어코드", "언어명", "타입", "추천여부", "플레이타임(h)", "리뷰원문",
];

async function ensureTabWithHeader(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string,
  header: string[]
): Promise<void> {
  await ensureTab(sheetsApi, spreadsheetId, tabName);
  const existing = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:1`,
  });
  if (!existing.data.values?.length) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }
}

// ── Save analysis to Google Sheets ─────────────────────────────────────────
export async function saveAnalysisToSheets(
  report: AnalysisReport,
  rawReviewsAll: RawReview[],
  rawReviewsRecent: RawReview[]
): Promise<void> {
  const sheetsApi = await getSheetsClient();

  // 1) Master sheet: reports_index
  await ensureTabWithHeader(sheetsApi, MASTER_SHEET_ID, "reports_index", [
    "UUID", "App ID", "게임명", "분석시각", "수집기간", "전체평가", "전체리뷰수",
    "최근평가", "최근리뷰수", "노션발행", "노션URL", "게임시트ID", "게임시트명",
  ]);

  // 2) Get or create per-game spreadsheet
  const gameSheetId = await getOrCreateGameSheet(report.app_id, report.game_name);

  // 3) Ensure per-game tabs with headers
  await ensureTabWithHeader(sheetsApi, gameSheetId, "분석 목록", LIST_HEADER);
  await ensureTabWithHeader(sheetsApi, gameSheetId, "분석 상세", DETAIL_HEADER);
  await ensureTabWithHeader(sheetsApi, gameSheetId, "리뷰 원문", RAW_HEADER);

  // 4) Append to master reports_index (A-O: 15 columns, O = one_liner)
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:O",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid, report.app_id, report.game_name, report.analysis_time,
        report.store_stats.collection_period,
        report.store_stats.all_desc, report.store_stats.all_total,
        report.store_stats.recent_desc, report.store_stats.recent_total,
        gameSheetId, `[${report.app_id}] ${report.game_name.slice(0, 50)}`,
        "", "", "",  // L, M, N — N 은 hidden 플래그(기본 빈값=공개)
        report.ai_data.critic_one_liner ?? "",  // O (index 14) — AI 한줄평
      ]],
    },
  });

  // 5) Append summary row to 분석 목록 (flat columns, easy to read in Sheets)
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: gameSheetId,
    range: "분석 목록!A:W",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid, report.analysis_time, report.app_id, report.game_name,
        report.store_stats.collection_period, report.release_date,
        report.store_stats.official_desc, report.store_stats.all_desc, report.store_stats.all_total,
        report.store_stats.recent_desc, report.store_stats.recent_total,
        report.store_stats.newbie_avg, report.store_stats.newbie_total, report.store_stats.newbie_desc,
        report.store_stats.norm_avg, report.store_stats.norm_total, report.store_stats.norm_desc,
        report.store_stats.core_avg, report.store_stats.core_total, report.store_stats.core_desc,
        report.store_stats.playtime_sample_total ?? "",
        report.ai_data.critic_one_liner, report.ai_data.sentiment_analysis,
      ]],
    },
  });

  // 6) Append full JSON blobs to 분석 상세
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: gameSheetId,
    range: "분석 상세!A:K",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid, report.analysis_time, report.app_id, report.game_name,
        report.release_date, report.recent_label, report.smart_reason, report.header_image,
        JSON.stringify(report.store_stats),
        JSON.stringify(report.ai_data),
        JSON.stringify(report.news_data),
      ]],
    },
  });

  // 7) Append raw review rows to 리뷰 원문
  const reviewRows: string[][] = [
    ...rawReviewsAll.map((r) => [
      report.uuid, report.analysis_time, r.language, getLangName(r.language),
      "누적", r.is_positive ? "TRUE" : "FALSE", String(r.playtime), r.review,
    ]),
    ...rawReviewsRecent.map((r) => [
      report.uuid, report.analysis_time, r.language, getLangName(r.language),
      "최근", r.is_positive ? "TRUE" : "FALSE", String(r.playtime), r.review,
    ]),
  ];
  if (reviewRows.length) {
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: gameSheetId,
      range: "리뷰 원문!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: reviewRows },
    });
  }
}


// ── Get report data from sheets ─────────────────────────────────────────────
export async function getReportFromSheets(uuid: string): Promise<AnalysisReport | null> {
  const sheetsApi = await getSheetsClient();

  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
  });
  const values = rows.data.values ?? [];
  let gameSheetId: string | null = null;
  for (let i = 1; i < values.length; i++) {
    const rowUuid = values[i][0]?.toString().trim();
    if (rowUuid === uuid.trim()) {
      // 구 포맷(notion 컬럼 포함): index 11이 gameSheetId
      // 신 포맷(notion 제거): index 9가 gameSheetId
      const v9 = values[i][9]?.toString() ?? "";
      const v11 = values[i][11]?.toString() ?? "";
      gameSheetId = v9.length > 10 && v9 !== "false" ? v9 : (v11.length > 10 ? v11 : null);
      break;
    }
  }
  if (!gameSheetId) {
    const storedUuids = values.slice(1).map((r) => JSON.stringify(r[0]));
    console.error(`[getReportFromSheets] UUID ${JSON.stringify(uuid)} not found. Stored: ${storedUuids.join(", ")}`);
    return null;
  }

  try {
    const detailRows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: gameSheetId,
      range: "분석 상세!A:K",
    });
    const dv = detailRows.data.values ?? [];

    for (let i = 1; i < dv.length; i++) {
      if (dv[i][0] === uuid) {
        const row = dv[i];
        return {
          uuid: row[0] ?? uuid,
          analysis_time: row[1] ?? "",
          app_id: row[2] ?? "",
          game_name: row[3] ?? "",
          release_date: row[4] ?? "",
          recent_label: row[5] ?? "최근 30일",
          smart_reason: row[6] ?? "",
          header_image: row[7] ?? "",
          store_stats: JSON.parse(row[8] ?? "{}"),
          ai_data: JSON.parse(row[9] ?? "{}"),
          news_data: JSON.parse(row[10] ?? "{}"),
          qa_history: [],
        };
      }
    }
    console.error(`[getReportFromSheets] UUID ${uuid} not found in 분석 상세 tab (gameSheetId: ${gameSheetId}, rows: ${dv.length})`);
    return null;
  } catch (err) {
    console.error(`[getReportFromSheets] Error reading game sheet ${gameSheetId}:`, err);
    return null;
  }
}

// ── Get all reports index ───────────────────────────────────────────────────
function parseIndexRow(row: string[]): ReportIndex {
  const v9 = row[9]?.toString() ?? "";
  const v11 = row[11]?.toString() ?? "";
  const gameSheetId = v9.length > 10 && v9 !== "false" ? v9 : (v11.length > 10 ? v11 : null);
  return {
    uuid: row[0] ?? "",
    app_id: row[1] ?? "",
    game_name: row[2] ?? "",
    analysis_time: row[3] ?? "",
    collection_period: row[4] ?? "",
    all_desc: row[5] ?? "",
    all_total: Number(row[6] ?? 0),
    recent_desc: row[7] ?? "",
    recent_total: Number(row[8] ?? 0),
    game_sheet_id: gameSheetId,
    // Column N (index 13) = hidden flag
    hidden: row[13]?.toString() === "Y",
    // Column O (index 14) = AI 한줄평
    one_liner: row[14]?.toString() ?? "",
  };
}

export async function getAllReports(): Promise<ReportIndex[]> {
  const sheetsApi = await getSheetsClient();
  try {
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "reports_index!A:O",
    });
    const values = rows.data.values ?? [];
    if (values.length <= 1) return [];
    return values.slice(1).reverse()
      .map(parseIndexRow)
      .filter((r) => !r.hidden);
  } catch {
    return [];
  }
}

// ── Admin: all reports (including hidden) ───────────────────────────────────
export async function getAllReportsAdmin(): Promise<ReportIndex[]> {
  const sheetsApi = await getSheetsClient();
  try {
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "reports_index!A:O",
    });
    const values = rows.data.values ?? [];
    if (values.length <= 1) return [];
    return values.slice(1).reverse().map(parseIndexRow);
  } catch {
    return [];
  }
}

// ── Admin: hide / show a report ─────────────────────────────────────────────
export async function setReportHidden(uuid: string, hidden: boolean): Promise<boolean> {
  const sheetsApi = await getSheetsClient();
  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:A",
  });
  const values = rows.data.values ?? [];
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]?.toString().trim() === uuid) { rowIndex = i + 1; break; } // 1-indexed sheet row
  }
  if (rowIndex === -1) return false;
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: `reports_index!N${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[hidden ? "Y" : "N"]] },
  });
  return true;
}

// ── Admin: delete a report row from index ───────────────────────────────────
export async function deleteReportFromIndex(uuid: string): Promise<boolean> {
  const sheetsApi = await getSheetsClient();
  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:A",
  });
  const values = rows.data.values ?? [];
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]?.toString().trim() === uuid) { rowIndex = i; break; } // 0-indexed
  }
  if (rowIndex === -1) return false;

  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: MASTER_SHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === "reports_index");
  if (sheet?.properties?.sheetId === undefined || sheet?.properties?.sheetId === null) return false;

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: MASTER_SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet!.properties!.sheetId!,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    },
  });
  return true;
}

// ── Config tab (site metadata + admin password) ─────────────────────────────
export async function getConfig(): Promise<Record<string, string>> {
  const sheetsApi = await getSheetsClient();
  try {
    await ensureTab(sheetsApi, MASTER_SHEET_ID, "config");
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "config!A:B",
    });
    const values = rows.data.values ?? [];
    const config: Record<string, string> = {};
    const start = values.length > 0 && values[0][0] === "key" ? 1 : 0;
    for (let i = start; i < values.length; i++) {
      const [key, value] = values[i];
      if (key && value !== undefined) config[key] = value;
    }
    if (Object.keys(config).length === 0) await initConfig(sheetsApi);
    return config;
  } catch {
    return {};
  }
}

async function initConfig(sheetsApi: ReturnType<typeof google.sheets>): Promise<void> {
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: "config!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["key", "value", "설명"],
        ["site_title", "스팀 리뷰 탈곡기", "브라우저 탭 & 네비게이션 타이틀"],
        ["site_description", "스팀 유저 리뷰 글로벌 민심 분석 도구", "메타 디스크립션"],
        ["admin_password", "admin1234", "관리자 패널 비밀번호 (반드시 변경하세요)"],
        ["marquee.speed_per_card", "10", "마퀴 카드당 스크롤 속도(초) — 낮을수록 빠름"],
      ],
    },
  });
}

// ── Get UI texts from master sheet ─────────────────────────────────────────
export async function getUiTexts(): Promise<Record<string, string>> {
  const sheetsApi = await getSheetsClient();
  try {
    await ensureTab(sheetsApi, MASTER_SHEET_ID, "ui_texts");
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "ui_texts!A:B",
    });
    const values = rows.data.values ?? [];
    const texts: Record<string, string> = {};
    const start = values.length > 0 && values[0][0] === "key" ? 1 : 0;
    for (let i = start; i < values.length; i++) {
      const [key, value] = values[i];
      if (key && value !== undefined) texts[key] = value;
    }
    if (Object.keys(texts).length === 0) await initUiTexts(sheetsApi);
    return texts;
  } catch {
    return {};
  }
}

async function initUiTexts(sheetsApi: ReturnType<typeof google.sheets>): Promise<void> {
  const defaults = [
    ["key", "value", "설명"],
    ["app_title", "스팀 리뷰 탈곡기", "앱 타이틀"],
    ["app_desc", "스팀 유저 리뷰 글로벌 민심 분석 도구", "앱 설명"],
    ["home_hero_title", "🌾 스팀 리뷰 탈곡해 드립니다", "홈 히어로 제목"],
    ["home_hero_desc", "스팀 상점 주소나 App ID를 입력하면, 스팀 유저 리뷰를 탈탈 털어 글로벌 민심을 확인할 수 있습니다.", "히어로 설명"],
    ["home_input_placeholder", "예: https://store.steampowered.com/app/2215430", "입력창 플레이스홀더"],
    ["home_analyze_btn", "🚜 리뷰 탈곡기 가동하기", "분석 버튼"],
    ["home_recent_title", "최근 완료된 리포트", "최근 기록 제목"],
    ["home_queue_title", "리포트 발행 대기소 (진행 중)", "대기열 섹션 제목"],
    ["home_view_all", "전체 보기 →", "전체 보기 링크"],
    ["home_queue_wait", "약 1~3분 소요됩니다.", "대기열 대기 메시지"],
    ["step_fetching_game", "🔍 게임 정보 확인 중...", "로딩 스텝1"],
    ["step_fetching_stats", "📥 스팀 리뷰 수집 중...", "로딩 스텝2"],
    ["step_fetching_reviews", "📊 리뷰 원문 수집 중...", "로딩 스텝3"],
    ["step_ai_analyzing", "🧠 AI 분석 중...", "로딩 스텝4"],
    ["step_saving", "💾 결과 저장 중...", "로딩 스텝5"],
    ["step_complete", "✅ 분석 완료!", "완료"],
    ["tab_summary", "📊 주요 요약", "탭1"],
    ["tab_news", "📰 소식 & 이슈", "탭2"],
    ["tab_playtime", "⏱ 플레이타임", "탭3"],
    ["tab_global", "🌍 글로벌 분석", "탭4"],
    ["tab_qa", "🙋 AI 질문", "탭5"],
    ["report_qa_placeholder", "예: 그래픽 관련 부정적인 여론이 있어?", "질문 입력 플레이스홀더"],
    ["report_qa_btn", "질문하기", "질문 버튼"],
    ["dashboard_title", "리포트 대시보드", "대시보드 제목"],
    ["dashboard_all_tab", "전체", "대시보드 전체 탭"],
    ["footer_version", "v3.0.0", "버전"],
    ["home_btn_submitting", "등록 중...", "분석 버튼 로딩 상태"],
    ["home_preview_loading", "게임 정보 확인 중...", "프리뷰 로딩 텍스트"],
    ["home_preview_release_label", "출시일:", "프리뷰 출시일 라벨"],
    ["home_preview_confirm", "✓ 이 게임이 맞나요?", "프리뷰 확인 문구"],
    ["home_queue_submitted", "✅ 대기열에 등록됐습니다. 잠시 후 아래 목록에서 진행 상황을 확인하세요.", "등록 완료 메시지"],
    ["home_empty_state_line1", "아직 분석된 게임이 없습니다.", "빈 상태 첫 줄"],
    ["home_empty_state_line2", "위에서 스팀 게임 주소를 입력해 첫 탈곡을 시작해 보세요 🌾", "빈 상태 둘째 줄"],
    ["error_invalid_input", "유효한 App ID 또는 스팀 상점 주소를 입력해 주세요.", "입력 오류"],
    ["error_game_not_found", "게임을 찾을 수 없습니다.", "게임 미발견 오류"],
    ["error_queue_register_failed", "대기열 등록에 실패했습니다.", "대기열 등록 실패"],
    ["queue_step_pending", "대기 중", "큐 단계: 대기"],
    ["queue_step_game_info", "게임 정보 확인 중...", "큐 단계: 게임 정보"],
    ["queue_step_stats", "통계 수집 중...", "큐 단계: 통계"],
    ["queue_step_reviews", "리뷰 수집 중...", "큐 단계: 리뷰"],
    ["queue_step_ai", "AI 분석 중...", "큐 단계: AI"],
    ["queue_step_saving", "리포트 저장 중...", "큐 단계: 저장"],
    ["queue_step_default", "처리 중...", "큐 단계: 기본값"],
    ["queue_requested_label", "요청:", "대기열 요청 시각 라벨"],
  ];
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: "ui_texts!A1",
    valueInputOption: "RAW",
    requestBody: { values: defaults },
  });
}

// ── Backfill one_liner into reports_index column O ─────────────────────────
export async function backfillOneLiner(): Promise<{ updated: number; skipped: number }> {
  const sheetsApi = await getSheetsClient();

  // 1) Read all reports_index rows
  const indexRows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:O",
  });
  const rows = indexRows.data.values ?? [];
  if (rows.length <= 1) return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const existing = row[14]?.toString() ?? "";
    if (existing) { skipped++; continue; }  // O열 이미 있음

    // gameSheetId: J(9) or L(11) fallback
    const v9  = row[9]?.toString()  ?? "";
    const v11 = row[11]?.toString() ?? "";
    const gameSheetId = v9.length > 10 && v9 !== "false" ? v9 : (v11.length > 10 ? v11 : null);
    if (!gameSheetId) { skipped++; continue; }

    const uuid = row[0]?.toString() ?? "";
    try {
      // 2) Read 분석 목록 from per-game sheet (V열 = AI한줄평, index 21)
      const listRows = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: gameSheetId,
        range: "분석 목록!A:V",
      });
      const listData = listRows.data.values ?? [];
      let oneLiner = "";
      for (let j = 1; j < listData.length; j++) {
        if (listData[j][0] === uuid) {
          oneLiner = listData[j][21]?.toString() ?? "";
          break;
        }
      }
      if (!oneLiner) { skipped++; continue; }

      // 3) Update reports_index O column (row i+1, 1-indexed)
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId: MASTER_SHEET_ID,
        range: `reports_index!O${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[oneLiner]] },
      });
      updated++;
    } catch {
      skipped++;
    }
  }
  return { updated, skipped };
}

// ── QA History ─────────────────────────────────────────────────────────────
const QA_HEADER = ["QA_UUID", "리포트UUID", "앱ID", "게임명", "질문시각", "질문", "답변"];

export async function appendQAToSheet(
  qaUuid: string,
  reportUuid: string,
  appId: string,
  gameName: string,
  askedAt: string,
  question: string,
  answer: string
): Promise<void> {
  const sheetsApi = await getSheetsClient();
  await ensureTabWithHeader(sheetsApi, MASTER_SHEET_ID, "QA 히스토리", QA_HEADER);
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: "QA 히스토리!A:G",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[qaUuid, reportUuid, appId, gameName, askedAt, question, answer]] },
  });
}

export async function getQAHistory(reportUuid: string): Promise<QAItem[]> {
  const sheetsApi = await getSheetsClient();
  try {
    await ensureTab(sheetsApi, MASTER_SHEET_ID, "QA 히스토리");
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "QA 히스토리!A:G",
    });
    const values = rows.data.values ?? [];
    return values.slice(1)
      .filter((row) => row[1] === reportUuid)
      .map((row) => ({
        qa_uuid: row[0] ?? "",
        q: row[5] ?? "",
        a: row[6] ?? "",
        asked_at: row[4] ?? "",
      }));
  } catch {
    return [];
  }
}

// ── Queue Management ────────────────────────────────────────────────────────
export async function addAnalysisToQueue(appId: string, gameName: string, uuid: string): Promise<void> {
  const sheetsApi = await getSheetsClient();
  await ensureTab(sheetsApi, MASTER_SHEET_ID, "Queue");
  const now = new Date().toISOString();
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: "Queue!A:E",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[appId, gameName, uuid, "PENDING", now]] },
  });
}

export async function updateQueueStatus(uuid: string, status: "COMPLETED" | "ERROR"): Promise<void> {
  const sheetsApi = await getSheetsClient();
  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "Queue!A:E",
  });
  const values = rows.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    if (values[i][2] === uuid) {
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId: MASTER_SHEET_ID,
        range: `Queue!D${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[status]] },
      });
      break;
    }
  }
}

export async function getPendingQueue(): Promise<Array<{ appId: string; gameName: string; uuid: string; status: string; timestamp: string }>> {
  const sheetsApi = await getSheetsClient();
  try {
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "Queue!A:E",
    });
    const values = rows.data.values ?? [];
    return values.map((row) => ({
      appId: row[0] ?? "",
      gameName: row[1] ?? "",
      uuid: row[2] ?? "",
      status: row[3] ?? "",
      timestamp: row[4] ?? "",
    })).filter((q) => q.status === "PENDING" || q.status === "PROCESSING");
  } catch {
    return [];
  }
}
