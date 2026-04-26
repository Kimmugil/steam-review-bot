import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function extractAppId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

export function sentimentClass(evalStr: string): string {
  if (evalStr.includes("긍정")) return "sentiment-pos";
  if (evalStr.includes("부정")) return "sentiment-neg";
  if (evalStr === "복합적") return "sentiment-mixed";
  return "sentiment-neutral";
}

export function sentimentBg(evalStr: string): string {
  if (evalStr.includes("긍정")) return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (evalStr.includes("부정")) return "bg-red-50 border-red-200 text-red-800";
  if (evalStr === "복합적") return "bg-amber-50 border-amber-200 text-amber-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

export function sentimentDot(evalStr: string): string {
  if (evalStr.includes("긍정")) return "bg-emerald-500";
  if (evalStr.includes("부정")) return "bg-red-500";
  if (evalStr === "복합적") return "bg-amber-500";
  return "bg-slate-400";
}

export function linePrefix(line: string): "pos" | "neg" | "neutral" {
  if (line.startsWith("[긍정]")) return "pos";
  if (line.startsWith("[부정]")) return "neg";
  return "neutral";
}

export function stripPrefix(line: string): string {
  return line.replace(/^\[(긍정|부정)\]\s*/, "");
}
