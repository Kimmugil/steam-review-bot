import type { Metadata } from "next";
import "./globals.css";
import { getUiTexts, getConfig } from "@/lib/sheets";
import { unstable_cache } from "next/cache";
import { Home, LayoutDashboard } from "lucide-react";

const getCachedUiTexts = unstable_cache(() => getUiTexts(), ["ui_texts"], { revalidate: 300 });
const getCachedConfig  = unstable_cache(() => getConfig(),   ["site_config"], { revalidate: 300 });

export async function generateMetadata(): Promise<Metadata> {
  const config = await getCachedConfig();
  return {
    title: config.site_title ?? "스팀 리뷰 탈곡기",
    description: config.site_description ?? "스팀 유저 리뷰 글로벌 민심 분석 도구",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getCachedUiTexts();
  const appTitle       = t.app_title       ?? "스팀 리뷰 탈곡기";
  const dashboardTitle = t.dashboard_title ?? "대시보드";

  return (
    <html lang="ko">
      <body className="min-h-screen" style={{ background: "#FAFAFA" }}>
        {/* ── Nav ──────────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 bg-white"
          style={{ borderBottom: "2px solid #1A1A1A" }}
        >
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            {/* 좌측: 로고 + 메뉴 */}
            <div className="flex items-center gap-1">
              <a
                href="/"
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity mr-3"
                style={{ fontWeight: 900, fontSize: 16, color: "#1A1A1A", textDecoration: "none" }}
              >
                <span className="text-xl">🌾</span>
                <span className="hidden sm:inline">{appTitle}</span>
              </a>
              <NavLink href="/" icon={<Home size={14} />} label="홈" />
              <NavLink href="/dashboard" icon={<LayoutDashboard size={14} />} label="대시보드" />
            </div>

            {/* 우측: 관리자 — 조용한 텍스트 링크 */}
            <a
              href="/admin"
              style={{ fontSize: 11, color: "#B0B0B0", textDecoration: "none", fontWeight: 500 }}
              className="hover:opacity-70 transition-opacity flex-shrink-0"
            >
              ⚙ 관리자
            </a>
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}

/* client-side active detection은 server layout에서 불가 — 단순 링크로 */
function NavLink({ href, icon, label }: { href: string; icon?: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors hover:bg-[#F5F5F5] rounded-full"
      style={{ fontWeight: 700, color: "#1A1A1A", textDecoration: "none" }}
    >
      {icon}
      {label}
    </a>
  );
}
