"use client";

import { useState, useRef } from "react";
import type { ReportIndex } from "@/lib/types";
import { sentimentClass, formatDateTime } from "@/lib/utils";

interface Props {
  r: ReportIndex;
  rotate?: number;
}

const STEAM_THUMB_URLS = (appId: string) => [
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
  `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
];

export default function ItemCard({ r, rotate = 0 }: Props) {
  const [hovered, setHovered] = useState(false);
  const fallbackIdx = useRef(0);
  const [imgSrc, setImgSrc]     = useState(STEAM_THUMB_URLS(r.app_id)[0]);
  const [imgHidden, setImgHidden] = useState(false);

  const handleImgError = () => {
    fallbackIdx.current += 1;
    const urls = STEAM_THUMB_URLS(r.app_id);
    if (fallbackIdx.current < urls.length) {
      setImgSrc(urls[fallbackIdx.current]);
    } else {
      setImgHidden(true);
    }
  };

  const stats = [
    { label: "전체 누적", desc: r.all_desc,    count: r.all_total    },
    { label: "최근 기간", desc: r.recent_desc, count: r.recent_total },
  ];

  return (
    <a
      href={`/report/${r.uuid}`}
      className="block"
      style={{
        width: 360,
        flexShrink: 0,
        border: "2px solid #1A1A1A",
        borderRadius: 16,
        background: "#FFFFFF",
        boxShadow: hovered ? "1px 1px 0px 0px #1A1A1A" : "2px 2px 0px 0px #1A1A1A",
        transform: `rotate(${hovered ? 0 : rotate}deg) translateY(${hovered ? -4 : 0}px)`,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        textDecoration: "none",
        overflow: "hidden",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ① 썸네일 헤더 (160px) */}
      <div style={{ position: "relative", height: 160, background: "#F0EFEC" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!imgHidden && (
          <img
            src={imgSrc}
            alt={r.game_name}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", display: "block",
              borderRadius: "14px 14px 0 0",
            }}
            onError={handleImgError}
          />
        )}
        {/* 그라디언트 오버레이 */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
          borderRadius: "14px 14px 0 0",
        }} />
        {/* 게임명 오버레이 */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px" }}>
          <p style={{ color: "#FFFFFF", fontWeight: 900, fontSize: 15, lineHeight: 1.3, margin: 0 }}
            className="line-clamp-2">
            {r.game_name}
          </p>
        </div>
        {/* 감성 배지 (우상단) */}
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          <span className={sentimentClass(r.all_desc)}>{r.all_desc}</span>
        </div>
      </div>

      {/* ② 한줄 요약 (min-height: 80px) */}
      <div style={{ minHeight: 80, padding: "14px 20px", borderBottom: "2px solid #E2E8F0" }}>
        {r.one_liner ? (
          <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.85, color: "#1A1A1A", margin: 0 }}>
            <span style={{
              backgroundColor: "#FFD600",
              padding: "0 4px",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            } as React.CSSProperties}>
              {r.one_liner}
            </span>
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>분석 결과가 여기에 표시됩니다</p>
        )}
      </div>

      {/* ③ 통계 TOP 2 (min-height: 96px) */}
      <div style={{ minHeight: 96, padding: "14px 20px", borderBottom: "2px solid #E2E8F0" }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: i < stats.length - 1 ? 10 : 0,
          }}>
            <span style={{
              flex: 1, fontSize: 12, overflow: "hidden",
              whiteSpace: "nowrap", textOverflow: "ellipsis",
              color: i === 0 ? "#1A1A1A" : "#9CA3AF",
            }}>
              {s.label}
            </span>
            <span
              className={sentimentClass(s.desc)}
              style={{ flexShrink: 0, fontFamily: "var(--font-pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)" }}
            >
              {s.desc}
            </span>
            <span style={{
              fontSize: 11, color: "#9CA3AF", flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}>
              {s.count.toLocaleString()}개
            </span>
          </div>
        ))}
      </div>

      {/* ④ 푸터 */}
      <div style={{ padding: "12px 20px" }}>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
          {formatDateTime(r.analysis_time)}
        </p>
      </div>
    </a>
  );
}
