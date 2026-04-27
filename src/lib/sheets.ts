import { google } from "googleapis";
import { getLangName } from "./config";
import type { AnalysisReport, ReportIndex, RawReview } from "./types";

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

const GAS_URL = "https://script.google.com/macros/s/AKfycbzGgJ2fObM3i01BFDBBfs-9uNxuGEV_D9Fk_0NZGBVMuZ_iVefSRJ20clo2Pf6JqwWrdQ/exec";

async function getOrCreateGameSheet(appId: string, gameName: string): Promise<string> {
  const sheetName = `[${appId}] ${gameName.slice(0, 50)}`;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}";
  let serviceAccountEmail = "";
  try { serviceAccountEmail = JSON.parse(raw).client_email || ""; } catch {}

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
    throw new Error(`GAS fetch failed (invalid JSON): ${rawText.slice(0, 300)}`);
  }

  if (!data.ok || !data.spreadsheetId) {
    throw new Error(`Failed to create spreadsheet: ${data.error ?? "spreadsheetId missing"}`);
  }
  return data.spreadsheetId;
}

// ── Tab header definitions ──────────────────────────────────────────────────
const LIST_HEADER = [
  "UUID", "분석시각", "앱ID", "게임명", "수집기간", "릴리즈일",
  "공식평가", "전체평가", "전체리뷰수", "최근평가", "최근리뷰수",
  "뉴비평균PT(h)", "뉴비표본수", "뉴비평가",
  "일반평균PT(h)", "일반표본수", "일반평가",
  "코어평균PT(h)", "코어표본수", "코어평가",
  "플레이타임표본수", "AI한줄평", "종합여론", "노션발행", "노션URL",
];

const DETAIL_HEADER = [
  "UUID", "분석시각", "앱ID", "게임명", "release_date", "recent_label",
  "smart_reason", "header_image", "store_stats", "ai_data", "news_data",
];

const RAW_HEADER = [
  "UUID", "분析시각", "언어코드", "언어명", "타입", "추천여부", "플레이타임(h)", "리뷰원문",
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

  // 4) Append to master reports_index
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        report.uuid, report.app_id, report.game_name, report.analysis_time,
        report.store_stats.collection_period,
        report.store_stats.all_desc, report.store_stats.all_total,
        report.store_stats.recent_desc, report.store_stats.recent_total,
        "false", "", gameSheetId, `[${report.app_id}] ${report.game_name.slice(0, 50)}`,
      ]],
    },
  });

  // 5) Append summary row to 분석 목록 (flat columns, easy to read in Sheets)
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: gameSheetId,
    range: "분석 목록!A:Y",
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
        "false", "",
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

// ── Update notion published status ─────────────────────────────────────────
export async function updateNotionStatus(uuid: string, notionPageId: string, notionUrl: string): Promise<void> {
  const sheetsApi = await getSheetsClient();

  const rows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: MASTER_SHEET_ID,
    range: "reports_index!A:M",
  });
  const values = rows.data.values ?? [];
  let gameSheetId: string | null = null;

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
      gameSheetId = values[i][11] ?? null;
      break;
    }
  }

  if (!gameSheetId) return;

  // 분석 목록: UUID in col A, 노션발행 in col X (24th), 노션URL in col Y (25th)
  const gameRows = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: gameSheetId,
    range: "분析 목록!A:A",
  });
  const gv = gameRows.data.values ?? [];
  for (let i = 1; i < gv.length; i++) {
    if (gv[i][0] === uuid) {
      const rowNum = i + 1;
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: gameSheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            { range: `분析 목록!X${rowNum}`, values: [["true"]] },
            { range: `분析 목록!Y${rowNum}`, values: [[notionUrl]] },
          ],
        },
      });
      break;
    }
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
  let notionPublished = false;
  let notionUrl: string | null = null;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === uuid) {
      gameSheetId = values[i][11] ?? null;
      notionPublished = values[i][9] === "true";
      notionUrl = values[i][10] || null;
      break;
    }
  }
  if (!gameSheetId) return null;

  try {
    const detailRows = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: gameSheetId,
      range: "분析 상세!A:K",
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
          notion_published: notionPublished,
          notion_url: notionUrl,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Get all reports index ───────────────────────────────────────────────────
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
