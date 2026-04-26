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
    <li className={`flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed py-1.5 ${className}`}>
      <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${
        type === "pos" ? "bg-emerald-500" : type === "neg" ? "bg-red-500" : "bg-slate-400"
      }`} />
      <span>{text}</span>
    </li>
  );
}
