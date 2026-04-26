"use client";

import { sentimentClass } from "@/lib/utils";

export default function SentimentBadge({ value }: { value: string }) {
  return <span className={sentimentClass(value)}>{value}</span>;
}
