"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function Collapsible({ title, children, defaultOpen = false, className = "" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ border: "2px solid #1A1A1A", borderRadius: 12 }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors"
        style={{ background: "#FFFFFF", cursor: "pointer", border: "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
      >
        <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>{title}</span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "#9CA3AF" }}
        />
      </button>
      {open && (
        <div
          className="px-4 pb-4"
          style={{ background: "#FFFFFF", borderTop: "2px solid #1A1A1A" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
