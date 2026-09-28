"use client";

import { ChevronDown } from "lucide-react";

// A dropdown styled like the other fields (the browser's own look is hidden).
export default function SelectBox({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none border border-line rounded-xl pl-3.5 pr-10 py-2.5 text-[14px] bg-white outline-none focus:border-ink cursor-pointer ${
          value ? "text-ink" : "text-muted"
        }`}
      >
        {children}
      </select>
      <ChevronDown size={15} strokeWidth={1.75} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
