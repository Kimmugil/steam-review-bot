import type { AiInsights, StoreStats, NewsData, QAItem } from "./types";
import { APP_VERSION } from "./config";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
};

type RichText = Record<string, unknown>;
type Block = Record<string, unknown>;

function rtText(content: string, annotations?: Record<string, unknown>, link?: string): RichText {
  return { text: { content, link: link ? { url: link } : null }, annotations: annotations ?? {} };
}

function divider(): Block { return { object: "block", type: "divider", divider: {} }; }

function heading2(text: string): Block {
  return { object: "block", type: "heading_2", heading_2: { rich_text: [rtText(text)] } };
}

function heading3(text: string, color = "default"): Block {
  return { object: "block", type: "heading_3", heading_3: { rich_text: [{ ...rtText(text), annotations: { color } }] } };
}

function paragraph(rt: RichText[]): Block {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rt } };
}

function callout(emoji: string, text: string, color = "gray_background", bold = false): Block {
  return {
    object: "block", type: "callout",
    callout: { icon: { emoji }, color, rich_text: [rtText(text, bold ? { bold: true } : {})] },
  };
}

function bullet(rt: RichText[]): Block {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt } };
}

function toggle(label: string, children: Block[], color = "gray"): Block {
  return {
    object: "block", type: "toggle",
    toggle: { rich_text: [{ ...rtText(label), annotations: { color } }], children },
  };
}

function catSortKey(name: string): number {
  if (name.includes("[긍정")) return 0;
  if (name.includes("[부정")) return 1;
  return 2;
}

function sortSentiments(lines: string[]): string[] {
  return [...(lines ?? [])].sort((a, b) => {
    const va = a.includes("[긍정]") ? 0 : a.includes("[부정]") ? 1 : 2;
    const vb = b.includes("[긍정]") ? 0 : b.includes("[부정]") ? 1 : 2;
    return va - vb;
  });
}

function fmtSentimentLine(line: string): RichText[] {
  if (line.startsWith("[긍정]")) {
    return [rtText("긍정  ", { color: "blue", bold: true }), rtText(line.slice(4).trim())];
  }
  if (line.startsWith("[부정]")) {
    return [rtText("부정  ", { color: "red", bold: true }), rtText(line.slice(4).trim())];
  }
  return [rtText(line)];
}

function catColor(name: string): string {
  if (name.includes("[긍정")) return "blue";
  if (name.includes("[부정")) return "red";
  return "default";
}

function cleanCatName(name: string): string {
  return name.replace("[긍정]", "").replace("[부정]", "").trim();
}

function scoreColor(val: string): string {
  if (val.includes("긍정")) return "blue";
  if (val.includes("부정")) return "red";
  return "gray";
}

type TableLike = { rank: string; count: number; ratio: string; pos_ratio: string; neg_ratio: string; eval: string; [key: string]: unknown };
function notionTable(rows: TableLike[], isRegion = false): Block {
  const col2 = isRegion ? "권역" : "언어";
  const header = {
    type: "table_row",
    table_row: {
      cells: [
        [rtText("순위", { bold: true, color: "gray" })],
        [rtText(col2, { bold: true, color: "gray" })],
        [rtText("리뷰 수", { bold: true, color: "gray" })],
        [rtText("비중", { bold: true, color: "gray" })],
        [rtText("👍 긍정 비율", { bold: true, color: "blue" })],
        [rtText("👎 부정 비율", { bold: true, color: "red" })],
        [rtText("📊 평가 결과", { bold: true, color: "gray" })],
      ],
    },
  };
  const dataRows = rows.map((r) => {
    const evalVal = String(r.eval ?? "");
    const evalCol = evalVal.includes("긍정적") ? "blue" : evalVal.includes("부정적") ? "red" : "gray";
    const nameVal = isRegion ? String(r.region) : String(r.lang_with_flag ?? r.lang);
    return {
      type: "table_row",
      table_row: {
        cells: [
          [rtText(String(r.rank))],
          [rtText(nameVal)],
          [rtText(`${Number(r.count).toLocaleString()}개`)],
          [rtText(String(r.ratio))],
          [rtText(String(r.pos_ratio), { color: "blue" })],
          [rtText(String(r.neg_ratio), { color: "red" })],
          [rtText(evalVal, { color: evalCol, bold: true })],
        ],
      },
    };
  });
  return {
    object: "block", type: "table",
    table: { table_width: 7, has_column_header: true, children: [header, ...dataRows] },
  };
}

async function appendBlocks(pageId: string, blocks: Block[]): Promise<void> {
  const url = `https://api.notion.com/v1/blocks/${pageId}/children`;
  for (let i = 0; i < blocks.length; i += 100) {
    const chunk = blocks.slice(i, i + 100);
    const deferredTables: Array<{ idx: number; table: Block }> = [];

    for (let j = 0; j < chunk.length; j++) {
      const block = chunk[j] as Record<string, unknown>;
      if (block.type === "toggle") {
        const tgl = block.toggle as Record<string, unknown>;
        const children = (tgl.children as Block[]) ?? [];
        const cleanChildren: Block[] = [];
        for (const child of children) {
          if ((child as Record<string, unknown>).type === "table") {
            deferredTables.push({ idx: j, table: child });
          } else {
            cleanChildren.push(child);
          }
        }
        if (cleanChildren.length) tgl.children = cleanChildren;
        else delete tgl.children;
      }
    }

    const res = await fetch(url, { method: "PATCH", headers: HEADERS, body: JSON.stringify({ children: chunk }) });
    if (!res.ok) continue;
    const created = (await res.json()).results as Array<{ id: string }>;

    for (const { idx, table } of deferredTables) {
      if (idx < created.length) {
        const toggleId = created[idx].id;
        await fetch(`https://api.notion.com/v1/blocks/${toggleId}/children`, {
          method: "PATCH", headers: HEADERS, body: JSON.stringify({ children: [table] }),
        });
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function uploadToNotion(params: {
  appId: string; gameName: string; releaseDate: string;
  storeStats: StoreStats; aiData: AiInsights;
  recentLabel: string; smartReason: string;
  newsData: NewsData; qaHistory: QAItem[];
}): Promise<string | null> {
  const { gameName, releaseDate, storeStats, aiData, recentLabel, smartReason, newsData, qaHistory } = params;

  const now = new Date();
  const kstOffset = 9 * 60;
  const kst = new Date(now.getTime() + kstOffset * 60000);
  const isoTs = kst.toISOString().replace("Z", "+09:00");

  const createData = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      "이름": { title: [{ text: { content: `${gameName} 평가 요약` } }] },
      "추출 시점": { date: { start: isoTs } },
      "탈곡기 버전": { rich_text: [{ text: { content: APP_VERSION } }] },
    },
  };

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST", headers: HEADERS, body: JSON.stringify(createData),
    });
    if (!res.ok) return null;
    const pageId: string = (await res.json()).id;

    const blocks: Block[] = [];

    // Bot info
    blocks.push(toggle("ℹ️ 탈곡기 안내 및 리포트 해석시 유의사항", [
      paragraph([rtText("본 리포트는 스팀의 유저 리뷰 원문 데이터를 수집하여 AI 텍스트 분석 엔진을 통해 주요 내용을 추출한 결과물입니다. AI는 실수할 수 있음을 고려해 주세요.\n\n리뷰는 유저의 실제 국적이 아닌 '리뷰 작성 시 설정된 언어'를 기준으로 집계됩니다.")]),
    ]));

    // AI one-liner
    blocks.push(heading2("🤖 AI 한줄평"));
    blocks.push(callout("💬", `❝ ${aiData.critic_one_liner} ❞`, "gray_background", true));
    blocks.push(paragraph([rtText(`${releaseDate} 스팀에 출시된 [${gameName}]에 대한 AI 분석 결과입니다.`, { color: "gray" })]));
    blocks.push(divider());

    // Sentiment
    blocks.push(heading2("📊 스팀 민심 온도계"));
    blocks.push(toggle("ℹ️ 각 평점 지표별 산출 기준 안내", [
      bullet([rtText("스팀 공식 평점: 스팀 상점을 통해 직접 구매한 유저만 반영된 점수입니다.")]),
      bullet([rtText("전체 누적 평점: 키 등록 및 무료 플레이 등 모든 유저를 포함한 포괄적 민심입니다.")]),
      bullet([rtText(`최근 동향: ${smartReason}`)]),
    ]));
    blocks.push(paragraph([
      rtText("🛑 스팀 공식 평점: ", { color: "gray" }),
      rtText(storeStats.official_desc, { color: scoreColor(storeStats.official_desc), bold: true }),
      rtText("\n📈 전체 누적 평가: ", { color: "gray" }),
      rtText(storeStats.all_desc, { color: scoreColor(storeStats.all_desc), bold: true }),
      rtText(`  (총 ${storeStats.all_total.toLocaleString()}개)`, { color: "gray" }),
      rtText(`\n🔥 ${recentLabel}: `, { color: "gray" }),
      rtText(storeStats.recent_desc, { color: scoreColor(storeStats.recent_desc), bold: true }),
      rtText(`  (표본 ${storeStats.recent_total.toLocaleString()}개)`, { color: "gray" }),
    ]));
    blocks.push({
      object: "block", type: "callout", callout: {
        icon: { emoji: "🎯" }, color: "gray_background",
        rich_text: [rtText("종합 여론 브리핑\n", { bold: true }), rtText(aiData.sentiment_analysis)],
      },
    });
    blocks.push(divider());

    // Global summary
    blocks.push(heading2("🎯 전체 리뷰 요약"));
    blocks.push(heading3("📈 전체 리뷰로 확인한 주요 여론"));
    for (const line of sortSentiments(aiData.final_summary_all)) blocks.push(bullet(fmtSentimentLine(line)));
    blocks.push(heading3(`🔥 ${recentLabel} 주요 여론`));
    const periodText = `📅 수집 기간: ${storeStats.collection_period}  (ℹ️ 추출 기준: ${smartReason})`;
    blocks.push(paragraph([rtText(periodText, { color: "gray" })]));
    for (const line of sortSentiments(aiData.final_summary_recent)) blocks.push(bullet(fmtSentimentLine(line)));
    blocks.push(divider());

    // Categories
    if (aiData.global_category_summary?.length) {
      blocks.push(heading2("📁 세부 카테고리 평가"));
      const pos = aiData.global_category_summary.filter((c) => c.category.includes("[긍정"));
      const neg = aiData.global_category_summary.filter((c) => c.category.includes("[부정"));
      const etc = aiData.global_category_summary.filter((c) => !c.category.includes("[긍정") && !c.category.includes("[부정"));

      const buildCatChildren = (cats: typeof pos) => {
        const ch: Block[] = [];
        for (const cat of cats) {
          const clean = cleanCatName(cat.category);
          const prefix = cat.category.includes("[긍정") ? "긍정  " : cat.category.includes("[부정") ? "부정  " : "";
          const col = catColor(cat.category) !== "default" ? catColor(cat.category) : "gray";
          ch.push(heading3(`${prefix}${clean}`));
          for (const line of sortSentiments(cat.summary)) ch.push(bullet(fmtSentimentLine(line)));
        }
        return ch;
      };
      if (pos.length) blocks.push(toggle("✅ 긍정 평가 항목", buildCatChildren(pos), "blue"));
      if (neg.length) blocks.push(toggle("⚠️ 부정 평가 항목", buildCatChildren(neg), "red"));
      if (etc.length) blocks.push(toggle("📌 기타 평가 항목", buildCatChildren(etc), "gray"));
      blocks.push(divider());
    }

    // News
    if (newsData.title) {
      blocks.push(heading2("📢 최신 소식"));
      if (newsData.image_url) {
        blocks.push({ object: "block", type: "image", image: { type: "external", external: { url: newsData.image_url } } });
      }
      blocks.push({
        object: "block", type: "callout", callout: {
          icon: { emoji: "🔗" }, color: "gray_background",
          rich_text: [
            rtText(`${newsData.date}  `, { color: "gray" }),
            rtText(newsData.title, { bold: true, underline: true }, newsData.url ?? ""),
          ],
        },
      });
      for (const line of aiData.news_summary ?? []) blocks.push(bullet([rtText(line)]));
      blocks.push(divider());
    }

    // Issues
    blocks.push(heading2("🚨 주요 이슈 픽"));
    blocks.push(paragraph([rtText(`💡 최신 동향 추출 기간(${storeStats.collection_period}) 내 작성된 리뷰를 중심으로 도출된 핵심 체크포인트입니다.`, { color: "gray" })]));
    if (aiData.ai_issue_pick?.length) {
      for (const issue of aiData.ai_issue_pick) blocks.push(bullet([rtText(issue)]));
    } else {
      blocks.push(callout("ℹ️", "데이터가 부족하거나 유의미한 주요 이슈(논란/체크포인트)가 발견되지 않았습니다."));
    }
    blocks.push(divider());

    // Playtime
    const pt = aiData.playtime_analysis;
    if (pt) {
      blocks.push(heading2("⏱️ 플레이타임별 여론 교차 분석"));
      blocks.push(toggle("ℹ️ 플레이타임 산출 기준 안내", [
        paragraph([rtText("전체 리뷰를 플레이타임순으로 정렬 후, 하위 25%(뉴비), 중위 50%(일반), 상위 25%(코어)로 분할하여 여론을 비교합니다.")]),
      ]));
      if (pt.comparison_insights?.length) {
        blocks.push({
          object: "block", type: "callout", callout: {
            icon: { emoji: "⚖️" }, color: "gray_background",
            rich_text: [rtText("핵심 교차 인사이트", { bold: true })],
            children: pt.comparison_insights.map((l) => bullet([rtText(l)])),
          },
        });
      }
      const segments = [
        { titleKey: pt.newbie_title, totalKey: storeStats.newbie_total, avgKey: storeStats.newbie_avg, descKey: storeStats.newbie_desc, summaryKey: pt.newbie_summary, color: "green" },
        { titleKey: pt.normal_title, totalKey: storeStats.norm_total, avgKey: storeStats.norm_avg, descKey: storeStats.norm_desc, summaryKey: pt.normal_summary, color: "blue" },
        { titleKey: pt.core_title, totalKey: storeStats.core_total, avgKey: storeStats.core_avg, descKey: storeStats.core_desc, summaryKey: pt.core_summary, color: "purple" },
      ];
      for (const seg of segments) {
        blocks.push(heading3(seg.titleKey, seg.color));
        blocks.push(paragraph([rtText(`표본: ${seg.totalKey.toLocaleString()}개 | 평균 플레이타임: ${seg.avgKey}시간 | 여론: ${seg.descKey}`, { color: "gray" })]));
        for (const line of sortSentiments(seg.summaryKey)) blocks.push(bullet(fmtSentimentLine(line)));
      }
      blocks.push(divider());
    }

    // Region analysis
    const regData = aiData.region_analysis;
    if (regData) {
      blocks.push(heading2("🗺️ 권역별 리뷰 분석"));
      blocks.push(toggle("ℹ️ 권역 맵핑 기준 안내", [
        paragraph([rtText("9대 권역: 🌏동아시아 / 🌴동남아시아 / 🌐영미권 / 🏰서유럽 / 🏔동유럽 / 🌨북유럽 / 🧊CIS(러시아권) / 💃중남미 / 🕌중동·기타")]),
      ]));
      if (regData.divergence_insight) {
        blocks.push(callout("💡", `권역별 주요 체크포인트\n${regData.divergence_insight}`));
      }
      for (const reg of regData.regions ?? []) {
        const regChildren: Block[] = [];
        if (reg.keywords?.length) {
          regChildren.push(paragraph([rtText(`🔑 주요 키워드: ${reg.keywords.join(", ")}`, { color: "gray" })]));
        }
        const sortedCats = [...(reg.categories ?? [])].sort((a, b) => catSortKey(a.name) - catSortKey(b.name));
        for (const cat of sortedCats) {
          const clean = cleanCatName(cat.name);
          const prefix = cat.name.includes("[긍정") ? "긍정  " : cat.name.includes("[부정") ? "부정  " : "";
          const col = catColor(cat.name);
          regChildren.push(paragraph([
            rtText(prefix, { color: col !== "default" ? col : "gray", bold: true }),
            rtText(clean, { bold: true }),
          ]));
          for (const line of sortSentiments(cat.summary)) regChildren.push(bullet(fmtSentimentLine(line)));
        }
        blocks.push(toggle(`📍 ${reg.region}  —  ${reg.trend}`, regChildren));
      }
      blocks.push(divider());
    }

    // Country analysis
    blocks.push(heading2("🌍 리뷰 작성 언어(국가)별 분석"));
    blocks.push(paragraph([rtText("누적 리뷰 작성 언어 상위(TOP) 1위~3위 국가와 '한국어' 리뷰에서 나타난 핵심 의견과 유저 원문을 모아서 보여줍니다.", { color: "gray" })]));
    for (const country of aiData.country_analysis ?? []) {
      blocks.push(heading3(`🚩 ${country.country}`));
      const sortedCats = [...(country.categories ?? [])].sort((a, b) => catSortKey(a.name) - catSortKey(b.name));
      for (const cat of sortedCats) {
        const clean = cleanCatName(cat.name);
        const prefix = cat.name.includes("[긍정") ? "긍정  " : cat.name.includes("[부정") ? "부정  " : "";
        const col = catColor(cat.name);
        blocks.push(paragraph([
          rtText(prefix, { color: col !== "default" ? col : "gray", bold: true }),
          rtText(clean, { bold: true }),
        ]));
        for (const line of sortSentiments(cat.summary)) blocks.push(bullet(fmtSentimentLine(line)));
        if (cat.quote?.original) {
          const quoteChildren: Block[] = [paragraph([rtText(`원문: ${cat.quote.original}`)])];
          if (cat.quote.korean) quoteChildren.push(paragraph([rtText(`번역: ${cat.quote.korean}`)]));
          blocks.push(toggle("유저 리뷰 원문 보기", quoteChildren));
        }
      }
    }
    blocks.push(divider());

    // Stats tables
    blocks.push(heading2("🌐 글로벌 언어 및 권역 통계표"));
    blocks.push(callout("⚠️", "스팀 리뷰 특성상 유저의 실제 국적이 아닌 '리뷰 작성 언어'를 기준으로 분류됩니다."));
    blocks.push(heading3("🗺️ 주요 권역별 누적 리뷰 비중"));
    blocks.push(notionTable(storeStats.table_data_region as unknown as TableLike[], true));
    blocks.push(heading3("🥇 언어별 누적 리뷰 비중 TOP 10"));
    blocks.push(notionTable(storeStats.table_data_all.slice(0, 10) as unknown as TableLike[]));
    blocks.push(toggle("언어별 누적 리뷰 비중 (전체 보기)", [notionTable(storeStats.table_data_all as unknown as TableLike[])]));
    if (storeStats.days_since_release >= 30 && storeStats.table_data_30?.length) {
      blocks.push(heading3("🔥 최근 30일 누적 리뷰 언어별 비중 TOP 10"));
      blocks.push(paragraph([rtText(`📅 수집 기간: ${storeStats.collection_period}`, { color: "gray" })]));
      blocks.push(notionTable(storeStats.table_data_30.slice(0, 10) as unknown as TableLike[]));
      blocks.push(toggle("최근 30일 누적 리뷰 비중 (전체보기)", [notionTable(storeStats.table_data_30 as unknown as TableLike[])]));
    }
    blocks.push(divider());

    // Q&A
    if (qaHistory.length) {
      blocks.push(heading2("🙋‍♀️ 추가 문의사항 답변"));
      for (const qa of qaHistory) {
        blocks.push(paragraph([rtText(`Q. ${qa.q}`, { bold: true, color: "blue" })]));
        blocks.push(callout("🤖", qa.a));
      }
    }

    await appendBlocks(pageId, blocks);
    return pageId;
  } catch {
    return null;
  }
}
