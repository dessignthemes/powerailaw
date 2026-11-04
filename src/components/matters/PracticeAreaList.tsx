"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";

// A searchable list of practice areas for a dropdown. `first` are shown at the top (e.g. the firm's main types).
export default function PracticeAreaList({
  options,
  value,
  onPick,
  first = [],
  noneLabel,
}: {
  options: string[];
  value: string | null;
  onPick: (v: string | null) => void;
  first?: string[];
  noneLabel?: string; // shows a "None" row when set
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rest = options.filter((o) => !first.includes(o));
  const match = (o: string) => !term || o.toLowerCase().includes(term);
  const top = first.filter(match);
  const others = rest.filter(match);
  const row = (o: string) => (
    <button
      key={o}
      type="button"
      onClick={() => onPick(o)}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-left transition-colors whitespace-nowrap ${value === o ? "bg-[#EEF1F6]" : "hover:bg-[#F4F6FA]"}`}
    >
      <span className="truncate">{o}</span>
      {value === o && <Check size={14} strokeWidth={2} className="flex-shrink-0" />}
    </button>
  );
  return (
    <div className="min-w-[260px]">
      <div className="flex items-center gap-2 bg-[#F4F6FA] border border-[#E3E7EF] rounded-full px-3 py-1.5 mb-1.5 focus-within:bg-white focus-within:border-[#C3CBDA]">
        <Search size={14} className="text-muted flex-shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search practice areas"
          aria-label="Search practice areas"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] placeholder:text-muted"
        />
      </div>
      <div className="max-h-[min(340px,50vh)] overflow-y-auto">
        {noneLabel && !term && (
          <button type="button" onClick={() => onPick(null)} className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] text-muted text-left transition-colors ${!value ? "bg-[#EEF1F6]" : "hover:bg-[#F4F6FA]"}`}>
            {noneLabel}
            {!value && <Check size={14} strokeWidth={2} />}
          </button>
        )}
        {top.map(row)}
        {top.length > 0 && others.length > 0 && <div className="border-t border-[#E6EAF1] my-1" />}
        {others.map(row)}
        {!top.length && !others.length && <div className="px-3 py-3 text-[13px] text-muted">No practice area matches “{q}”.</div>}
      </div>
    </div>
  );
}
