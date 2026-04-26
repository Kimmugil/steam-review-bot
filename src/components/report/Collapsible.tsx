"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function Collapsible({ title, children, defaultOpen = false, className = "" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border border-slate-200 rounded-xl overflow-hidden", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 bg-white border-t border-slate-100">{children}</div>}
    </div>
  );
}
