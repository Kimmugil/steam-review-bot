import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "스팀 리뷰 탈곡기",
  description: "스팀 유저 리뷰 글로벌 민심 분석 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50">
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 font-bold text-slate-800 hover:text-slate-600 transition-colors">
              <span className="text-xl">🌾</span>
              <span>스팀 리뷰 탈곡기</span>
            </a>
            <div className="flex items-center gap-4">
              <a href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
                리포트 대시보드
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
