import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getTexts } from "@/lib/texts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTexts();
  return { title: t.site_title, description: "스팀 유저 리뷰를 언어별로 나눠 평가와 이유를 정리합니다. 숫자는 코드가 계산하고 AI는 해석만 합니다." };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getTexts();
  return (
    <html lang="ko">
      <body>
        <div className="wrap">
          <div className="appbar">
            <Link href="/" className="brand"><i /><span>{t.site_title}</span></Link>
            <nav className="appnav">
              <Link href="/">{t.nav_home}</Link>
              <Link href="/about">{t.nav_about}</Link>
            </nav>
            {/* 로그인 여부를 읽지 않아야 공개 화면을 미리 만들어 두고(캐시) 빠르게 보여 줄 수 있습니다 */}
            <div className="right"><Link href="/admin" className="muted">{t.nav_admin}</Link></div>
          </div>
          {children}
          <div className="appfoot">{t.foot}</div>
        </div>
      </body>
    </html>
  );
}
