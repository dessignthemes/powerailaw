"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function DropdownField({
  icon,
  value,
  options,
  onChange,
}: {
  icon?: React.ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] bg-card-alt hover:bg-line/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {icon}
          {value}
        </span>
        <ChevronDown size={13} strokeWidth={1.75} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-full min-w-[200px]">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors text-left"
              >
                {opt}
                {opt === value && <Check size={14} strokeWidth={2} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
