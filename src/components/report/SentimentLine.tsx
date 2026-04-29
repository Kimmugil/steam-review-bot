"use client";

import { linePrefix, stripPrefix } from "@/lib/utils";

interface Props {
  line: string;
  className?: string;
}

export default function SentimentLine({ line, className = "" }: Props) {
  const type = linePrefix(line);
  const text = stripPrefix(line);
  return (
    <li
      className={`flex items-start gap-2 text-sm leading-relaxed py-1 ${className}`}
      style={{ color: "#1A1A1A" }}
    >
      <span
        className="mt-[5px] flex-shrink-0 w-1.5 h-1.5 rounded-full"
        style={{
          background: type === "pos" ? "#56D0A0" : type === "neg" ? "#FF6B6B" : "#E2E8F0",
          border: "1.5px solid #1A1A1A",
        }}
      />
      <span>{text}</span>
    </li>
  );
}
