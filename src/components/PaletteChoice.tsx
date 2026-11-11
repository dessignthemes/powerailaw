"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";

// Colour scheme: warm beige (the default, the original LawPower look) or the cool
// blue-grey one. Lives on <html data-palette>; the choice is kept in this browser.
const KEY = "lp-palette";
export type Palette = "warm" | "cool";

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
  return () => mo.disconnect();
}
const current = (): Palette => (document.documentElement.dataset.palette === "cool" ? "cool" : "warm");

export function setPalette(p: Palette) {
  document.documentElement.dataset.palette = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* private mode */
  }
}

const OPTIONS: { key: Palette; label: string; note: string; swatch: string[] }[] = [
  { key: "warm", label: "Warm beige", note: "The original look, softer on the eyes", swatch: ["#FAF6EF", "#F2EBE1", "#E4D8C2"] },
  { key: "cool", label: "Cool grey", note: "Blue-grey", swatch: ["#FCFCFC", "#ECEFF6", "#CFD7E8"] },
];

export default function PaletteChoice() {
  const palette = useSyncExternalStore(subscribe, current, () => "warm" as Palette);
  return (
    <div className="flex gap-3 flex-wrap">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => setPalette(o.key)}
          aria-pressed={palette === o.key}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${palette === o.key ? "border-btn-ring bg-chip" : "border-line bg-white hover:bg-chip/60"}`}
        >
          <span className="flex -space-x-1.5">
            {o.swatch.map((c) => (
              <span key={c} className="w-6 h-6 rounded-full border border-black/10" style={{ backgroundColor: c }} />
            ))}
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold">{o.label}</span>
            <span className="block text-[12px] text-muted">{o.note}</span>
          </span>
          {palette === o.key && <Check size={15} strokeWidth={2} className="ml-1" />}
        </button>
      ))}
    </div>
  );
}
