import { google } from "googleapis";
import type { AnalysisReport, ReportIndex } from "./types";

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

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

// ── Ensure a tab exists, create if not ──────────────────────────────────────
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

const GAS_URL = "https://script.google.com/macros/s/AKfycbzGgJ2fObM3i01BFDBBfs-9uNxuGEV_D9Fk_0NZGBVMuZ_iVefSRJ20clo2Pf6JqwWrdQ/exec";

// ── Get or create per-game spreadsheet ──────────────────────────────────────
async function getOrCreateGameSheet(appId: string, gameName: string): Promise<string> {
  const sheetName = `[${appId}] ${gameName.slice(0, 50)}`;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}";
  let serviceAccountEmail = "";
  try {
    serviceAccountEmail = JSON.parse(raw).client_email || "";
  } catch {}

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderId: "1cMuannCe1rQGArv1vseTKtlTetg_U1Mr",
      fileName: sheetName,
      serviceAccountEmail
    }),
  });

  const rawText = await response.text();
  let data: { ok: boolean; spreadsheetId?: string; reused?: boolean; error?: string };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`GAS fetch failed (invalid JSON): ${rawText.slice(0, 300)}`);
  }

  if (!data.ok || !data.spreadsheetId) {
    throw new Error(`Failed to create spreadsheet: ${data.error ?? "spreadsheetId missing"}`);
  }
  const newId: string = data.spreadsheetId;

  if (!data.reused) {
    const sheetsApi = await getSheetsClient();
    await ensureTab(sheetsApi, newId, "분석 목록");
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: newId,
      range: "분석 목록!A1:I1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["UUID", "분석 시각", "수집 기간", "전체 평가", "전체 리뷰수", "최근 평가", "최근 리뷰수", "노션 발행", "노션 URL"]],
      },
    });
  }

  return newId;
}

// ── Save analysis to Google Sheets ──────────────────────────────────────────
export async function saveAnalysisToSheets(report: AnalysisReport): Promise<void> {
  const sheetsApi = await getSheetsClient();

  // 1) Master sheet: reports_index
  await ensureTab(sheetsApi, MASTER_SHEET_ID, "reports_index");

  // Check if header exists
  const masterHeader = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A1:M1",
  });
  if (!masterHeader.data.values?.length) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: MASTER_SHEET_ID,
      range: "reports_index!A1:M1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["UUID", "App ID", "게임명", "분석 시각", "수집 기간", "전체 평가", "전체 리뷰수", "최근 평가", "최근 리뷰수", "노션 발행", "노션 URL", "게임 시트 ID", "게임 시트명"]],
      },
    });
  }

  // 2) Get or create per-game sheet
  const gameSheetId = await getOrCreateGameSheet(report.app_id, report.game_name);

  // 3) Append row to master reports_index
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid,
        report.app_id,
        report.game_name,
        report.analysis_time,
        report.store_stats.collection_period,
        report.store_stats.all_desc,
        report.store_stats.all_total,
        report.store_stats.recent_desc,
        report.store_stats.recent_total,
        "false",
        "",
        gameSheetId,
        `[${report.app_id}] ${report.game_name.slice(0, 50)}`,
      ]],
    },
  });

  // 4) Per-game sheet: 분석 목록
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: gameSheetId,
    range: "분석 목록!A:I",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid,
        report.analysis_time,
        report.store_stats.collection_period,
        report.store_stats.all_desc,
        report.store_stats.all_total,
        report.store_stats.recent_desc,
        report.store_stats.recent_total,
        "false",
        "",
      ]],
    },
  });

  // 5) Per-game sheet: data tab (store full JSON)
  const dataTabName = `data_${report.uuid.slice(0, 8)}`;
  await ensureTab(sheetsApi, gameSheetId, dataTabName);
  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: gameSheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${dataTabName}!A1`, values: [["필드", "데이터"]] },
        { range: `${dataTabName}!A2`, values: [["uuid", report.uuid]] },
        { range: `${dataTabName}!A3`, values: [["app_id", report.app_id]] },
        { range: `${dataTabName}!A4`, values: [["game_name", report.game_name]] },
        { range: `${dataTabName}!A5`, values: [["analysis_time", report.analysis_time]] },
        { range: `${dataTabName}!A6`, values: [["release_date", report.release_date]] },
        { range: `${dataTabName}!A7`, values: [["recent_label", report.recent_label]] },
        { range: `${dataTabName}!A8`, values: [["smart_reason", report.smart_reason]] },
        { range: `${dataTabName}!A9`, values: [["store_stats", JSON.stringify(report.store_stats)]] },
        { range: `${dataTabName}!A10`, values: [["ai_data", JSON.stringify(report.ai_data)]] },
        { range: `${dataTabName}!A11`, values: [["news_data", JSON.stringify(report.news_data)]] },
        { range: `${dataTabName}!A12`, values: [["header_image", report.header_image]] },
      ],
    },
  });
}

// ── Update notion published status ──────────────────────────────────────────
export async function updateNotionStatus(uuid: string, notionPageId: string, notionUrl: string): Promise<void> {
  const sheetsApi = await getSheetsClient();

  // Find row in master reports_index
  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
  });
  const values = rows.data.values ?? [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === uuid) {
      const rowNum = i + 1;
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: MASTER_SHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            { range: `reports_index!J${rowNum}`, values: [["true"]] },
            { range: `reports_index!K${rowNum}`, values: [[notionUrl]] },
          ],
        },
      });

      // Also update per-game sheet
      const gameSheetId = values[i][11];
      if (gameSheetId) {
        const gameRows = await sheetsApi.spreadsheets.values.get({
          spreadsheetId: gameSheetId,
          range: "분석 목록!A:I",
        });
        const gv = gameRows.data.values ?? [];
        for (let j = 1; j < gv.length; j++) {
          if (gv[j][0] === uuid) {
            await sheetsApi.spreadsheets.values.batchUpdate({
              spreadsheetId: gameSheetId,
              requestBody: {
                valueInputOption: "RAW",
                data: [
                  { range: `분석 목록!H${j + 1}`, values: [["true"]] },
                  { range: `분석 목록!I${j + 1}`, values: [[notionUrl]] },
                ],
              },
            });
            break;
          }
        }
      }
      break;
    }
  }
}

// ── Get report data from sheets ──────────────────────────────────────────────
export async function getReportFromSheets(uuid: string): Promise<AnalysisReport | null> {
  const sheetsApi = await getSheetsClient();

  // Find in master sheet
  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
  });
  const values = rows.data.values ?? [];
  let gameSheetId: string | null = null;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === uuid) {
      gameSheetId = values[i][11] ?? null;
      break;
    }
  }
  if (!gameSheetId) return null;

  // Read data tab
  const dataTabName = `data_${uuid.slice(0, 8)}`;
  try {
    const dataRows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: gameSheetId,
      range: `${dataTabName}!A:B`,
    });
    const dv = dataRows.data.values ?? [];
    const map: Record<string, string> = {};
    for (const row of dv) {
      if (row[0] && row[1]) map[row[0]] = row[1];
    }

    // Also get notion status from master
    let notionPublished = false;
    let notionUrl: string | null = null;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === uuid) {
        notionPublished = values[i][9] === "true";
        notionUrl = values[i][10] || null;
        break;
      }
    }

    return {
      uuid: map.uuid ?? uuid,
      app_id: map.app_id ?? "",
      game_name: map.game_name ?? "",
      release_date: map.release_date ?? "",
      header_image: map.header_image ?? "",
      recent_label: map.recent_label ?? "최근 30일",
      smart_reason: map.smart_reason ?? "",
      store_stats: JSON.parse(map.store_stats ?? "{}"),
      ai_data: JSON.parse(map.ai_data ?? "{}"),
      news_data: JSON.parse(map.news_data ?? "{}"),
      qa_history: [],
      analysis_time: map.analysis_time ?? "",
      notion_published: notionPublished,
      notion_url: notionUrl,
    };
  } catch {
    return null;
  }
}

// ── Get all reports index ────────────────────────────────────────────────────
export async function getAllReports(): Promise<ReportIndex[]> {
  const sheetsApi = await getSheetsClient();
  try {
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "reports_index!A:K",
    });
    const values = rows.data.values ?? [];
    if (values.length <= 1) return [];
    return values.slice(1).reverse().map((row) => ({
      uuid: row[0] ?? "",
      app_id: row[1] ?? "",
      game_name: row[2] ?? "",
      analysis_time: row[3] ?? "",
      collection_period: row[4] ?? "",
      all_desc: row[5] ?? "",
      all_total: Number(row[6] ?? 0),
      recent_desc: row[7] ?? "",
      recent_total: Number(row[8] ?? 0),
      notion_published: row[9] === "true",
      notion_url: row[10] || null,
      game_sheet_id: row[11] ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Get UI texts from master sheet ──────────────────────────────────────────
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

    // Skip header row if it looks like a header
    const start = values.length > 0 && values[0][0] === "key" ? 1 : 0;
    for (let i = start; i < values.length; i++) {
      const [key, value] = values[i];
      if (key && value !== undefined) texts[key] = value;
    }

    // If empty, initialize with defaults
    if (Object.keys(texts).length === 0) {
      await initUiTexts(sheetsApi);
    }

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
    ["home_recent_title", "최근 분석 기록", "최근 기록 제목"],
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
    ["report_publish_btn", "📤 노션으로 발행", "발행 버튼"],
    ["report_published_label", "노션에서 보기", "발행 완료 링크"],
    ["report_qa_placeholder", "예: 그래픽 관련 부정적인 여론이 있어?", "질문 입력 플레이스홀더"],
    ["report_qa_btn", "질문하기", "질문 버튼"],
    ["dashboard_title", "리포트 대시보드", "대시보드 제목"],
    ["dashboard_all_tab", "전체", "대시보드 전체 탭"],
    ["footer_version", "v3.0.0", "버전"],
  ];

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range: "ui_texts!A1",
    valueInputOption: "RAW",
    requestBody: { values: defaults },
  });
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
    requestBody: {
      values: [[appId, gameName, uuid, "PENDING", now]],
    },
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

export async function getPendingQueue(): Promise<Array<{appId: string, gameName: string, uuid: string, status: string, timestamp: string}>> {
  const sheetsApi = await getSheetsClient();
  try {
    const rows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: MASTER_SHEET_ID,
      range: "Queue!A:E",
    });
    const values = rows.data.values ?? [];
    return values.map(row => ({
      appId: row[0] ?? "",
      gameName: row[1] ?? "",
      uuid: row[2] ?? "",
      status: row[3] ?? "",
      timestamp: row[4] ?? ""
    })).filter(q => q.status === "PENDING" || q.status === "PROCESSING");
  } catch {
    return [];
  }
}
