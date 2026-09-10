"use client";

import { useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";

const options = [
  { key: "everyone", label: "Everyone's tasks" },
  { key: "mine", label: "Only mine" },
];

export default function TaskFilterDropdown() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("everyone");

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-card-alt hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} />
        All tasks
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[190px]">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setSelected(o.key);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-colors ${
                  selected === o.key ? "bg-card-alt" : "hover:bg-card-alt"
                }`}
              >
                {o.label}
                {selected === o.key && <Check size={14} strokeWidth={2} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
