"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

// The matter number with a small pencil to change it (e.g. to match the number
// the matter had in LEAP). The new number must look like REP-2026-3709 and not
// be used by another matter.
export default function MatterNumberEdit({ matterId, number, onSaved }: { matterId: string; number: string | null | undefined; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = value.trim().toUpperCase().replace(/\s+/g, "");
    if (!next || next === (number ?? "")) return setEditing(false);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/matters/${matterId}/number`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't change the matter number.");
      setEditing(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <div className="inline-flex items-center gap-1 mb-1.5">
        {number ? (
          <span className="inline-flex items-center bg-chip rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold tracking-wide">{number}</span>
        ) : (
          <span className="text-[12.5px] text-muted">No matter number</span>
        )}
        <button
          onClick={() => {
            setValue(number ?? "");
            setError(null);
            setEditing(true);
          }}
          title={number ? "Change the matter number" : "Add a matter number"}
          aria-label={number ? "Change the matter number" : "Add a matter number"}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-chip text-ink hover:bg-btn transition-colors"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </div>
    );

  return (
    <div className="mb-1.5">
      <div className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="REP-2026-3709"
          aria-label="Matter number"
          maxLength={24}
          className="bg-white border border-line rounded-full px-3 py-1 text-[13px] font-semibold tracking-wide w-[170px] outline-none focus:border-btn-ring"
        />
        <button onClick={() => void save()} disabled={busy} aria-label="Save matter number" title="Save" className="w-7 h-7 rounded-full bg-btn hover:bg-btn-hover flex items-center justify-center disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button onClick={() => setEditing(false)} disabled={busy} aria-label="Cancel" title="Cancel" className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted">
          <X size={13} />
        </button>
      </div>
      <div className={`text-[12px] mt-1 ${error ? "text-[#9F1D1D]" : "text-muted"}`}>{error ?? "Like REP-2026-3709: abbreviation, year, number. Press Enter to save."}</div>
    </div>
  );
}
