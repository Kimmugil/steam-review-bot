export interface Review {
  language: string;
  is_positive: boolean;
  playtime: number;
  steam_id: string;
  review: string;
}

export interface LangStat {
  total: number;
  positive: number;
}

export interface TableRow {
  rank: string;
  lang: string;
  lang_with_flag: string;
  count: number;
  ratio: string;
  pos_ratio: string;
  neg_ratio: string;
  eval: string;
}

export interface RegionTableRow {
  rank: string;
  region: string;
  count: number;
  ratio: string;
  pos_ratio: string;
  neg_ratio: string;
  eval: string;
}

export interface StoreStats {
  official_desc: string;
  all_desc: string;
  all_total: number;
  recent_desc: string;
  recent_total: number;
  table_data_all: TableRow[];
  table_data_30: TableRow[];
  table_data_region: RegionTableRow[];
  days_since_release: number;
  newbie_avg: number;
  newbie_total: number;
  newbie_desc: string;
  norm_avg: number;
  norm_total: number;
  norm_desc: string;
  core_avg: number;
  core_total: number;
  core_desc: string;
  collection_period: string;
  country_langs_ordered: string[];
  summary_langs: string[];
  summary_coverage: number;
  region_langs: string[];
  issue_langs: string[];
}

export interface CategorySummary {
  category: string;
  summary: string[];
}

export interface RegionCategory {
  name: string;
  summary: string[];
}

export interface RegionData {
  region: string;
  trend: string;
  keywords: string[];
  categories: RegionCategory[];
}

export interface Quote {
  original: string;
  korean: string;
}

export interface CountryCategory {
  name: string;
  summary: string[];
  quote: Quote;
}


export interface CountryData {
  country: string;
  categories: CountryCategory[];
}

export interface PlaytimeAnalysis {
  comparison_insights: string[];
  newbie_title: string;
  newbie_summary: string[];
  normal_title: string;
  normal_summary: string[];
  core_title: string;
  core_summary: string[];
}

export interface AiInsights {
  critic_one_liner: string;
  sentiment_analysis: string;
  final_summary_all: string[];
  final_summary_recent: string[];
  ai_issue_pick: string[];
  news_summary: string[];
  playtime_analysis: PlaytimeAnalysis;
  global_category_summary: CategorySummary[];
  region_analysis: {
    divergence_insight: string;
    regions: RegionData[];
  };
  country_analysis: CountryData[];
}

export interface NewsData {
  title: string | null;
  contents: string | null;
  url: string | null;
  date: string | null;
  image_url: string | null;
}

export interface QAItem {
  q: string;
  a: string;
}

export interface AnalysisReport {
  uuid: string;
  app_id: string;
  game_name: string;
  release_date: string;
  header_image: string;
  recent_label: string;
  smart_reason: string;
  store_stats: StoreStats;
  ai_data: AiInsights;
  news_data: NewsData;
  qa_history: QAItem[];
  analysis_time: string;
  notion_published: boolean;
  notion_url: string | null;
}

export interface ReportIndex {
  uuid: string;
  app_id: string;
  game_name: string;
  analysis_time: string;
  collection_period: string;
  all_desc: string;
  all_total: number;
  recent_desc: string;
  recent_total: number;
  notion_published: boolean;
  notion_url: string | null;
  game_sheet_id: string | null;
}

export type AnalysisStep =
  | { step: "game_info"; data: { game_name: string; header_image: string; release_date: string } }
  | { step: "stats_start" }
  | { step: "reviews_start" }
  | { step: "ai_start" }
  | { step: "saving" }
  | { step: "complete"; uuid: string }
  | { step: "error"; message: string };
