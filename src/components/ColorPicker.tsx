"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

const colors = [
  "#A5A6F6",
  "#4ADE80",
  "#A855F7",
  "#F0A0A0",
  "#FACC15",
  "#FB923C",
  "#3B82F6",
  "#6B7280",
  "#4F46E5",
  "#22C55E",
  "#EF4444",
];

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 border border-line rounded-xl px-2.5 py-2.5 bg-card-alt hover:bg-line/50 transition-colors"
      >
        <span
          className="w-5 h-5 rounded-full flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <ChevronDown size={13} strokeWidth={1.75} className="text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-2.5">
            <div className="grid grid-cols-6 gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className={`w-7 h-7 rounded-full flex-shrink-0 transition-transform hover:scale-110 ${
                    c === value ? "ring-2 ring-offset-2 ring-ink" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-muted hover:text-ink"
              >
                <X size={13} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
