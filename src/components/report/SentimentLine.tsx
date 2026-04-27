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
    <li className={`flex items-start gap-2 text-sm text-slate-700 leading-relaxed py-1 ${className}`}>
      <span className={`mt-[5px] flex-shrink-0 w-1.5 h-1.5 rounded-full ${
        type === "pos" ? "bg-emerald-500" : type === "neg" ? "bg-red-400" : "bg-slate-300"
      }`} />
      <span>{text}</span>
    </li>
  );
}
