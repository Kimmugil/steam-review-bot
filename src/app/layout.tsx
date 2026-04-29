import type { Metadata } from "next";
import "./globals.css";
import { getUiTexts, getConfig } from "@/lib/sheets";
import { unstable_cache } from "next/cache";

const getCachedUiTexts = unstable_cache(
  () => getUiTexts(),
  ["ui_texts"],
  { revalidate: 300 }
);

const getCachedConfig = unstable_cache(
  () => getConfig(),
  ["site_config"],
  { revalidate: 300 }
);

export async function generateMetadata(): Promise<Metadata> {
  const config = await getCachedConfig();
  return {
    title: config.site_title ?? "스팀 리뷰 탈곡기",
    description: config.site_description ?? "스팀 유저 리뷰 글로벌 민심 분석 도구",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getCachedUiTexts();
  const appTitle = t.app_title ?? "스팀 리뷰 탈곡기";
  const dashboardTitle = t.dashboard_title ?? "리포트 대시보드";

  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50">
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 font-bold text-slate-800 hover:text-slate-600 transition-colors">
              <span className="text-xl">🌾</span>
              <span>{appTitle}</span>
            </a>
            <div className="flex items-center gap-4">
              <a href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
                {dashboardTitle}
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
