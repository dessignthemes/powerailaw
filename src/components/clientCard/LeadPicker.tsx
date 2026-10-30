"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, X, UserSearch } from "lucide-react";
import { STATUS_LABEL, leadName, type Lead } from "@/lib/leads";

// Client Intake → "Import from leads": pick a prospective client whose intake
// form fills in this card.
export default function LeadPicker({ onClose, onPick }: { onClose: () => void; onPick: (lead: Lead) => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/leads")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load the leads.");
        // Filled-in forms first; leads that already became clients or were declined are left out.
        setLeads(((d.leads ?? []) as Lead[]).filter((l) => l.status === "new" || l.status === "contacted" || (l.status === "invited" && l.submittedAt)));
      })
      .catch((e: Error) => {
        setError(e.message);
        setLeads([]);
      });
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (leads ?? []).filter((l) => words.every((w) => `${leadName(l)} ${l.email} ${l.phone} ${l.matterType}`.toLowerCase().includes(w)));
  return (
    <div className="fixed inset-0 z-[60] bg-black/25 flex items-center justify-center px-4 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Import from leads" className="bg-page rounded-2xl w-full max-w-[560px] max-h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-[18px] font-semibold flex items-center gap-2">
            <UserSearch size={18} /> Import from leads
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <p className="px-6 text-[13px] text-muted mb-3">Their name, contact details, address and what they need fill in this card. Anything already on the card is kept.</p>
        <label className="mx-6 flex items-center gap-2 bg-white border border-line rounded-full px-3.5 py-2 mb-3 focus-within:border-btn-ring">
          <Search size={14} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" className="flex-1 bg-transparent outline-none text-[13.5px]" />
        </label>
        <div className="overflow-y-auto px-3 pb-3 min-h-[120px]">
          {leads === null ? (
            <div className="flex items-center gap-2 text-[13.5px] text-muted px-3 py-6">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-[13.5px] text-[#9F1D1D]">{error}</div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-6 text-[13.5px] text-muted text-center">
              {q ? "No leads match." : "No leads waiting."}{" "}
              <Link href="/dashboard/leads" className="underline underline-offset-2 text-ink">
                Go to Potential Leads
              </Link>
            </div>
          ) : (
            shown.map((l) => (
              <button key={l.id} onClick={() => onPick(l)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-chip flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium truncate">
                    {leadName(l)}
                    {l.matterType && <span className="text-muted font-normal"> · {l.matterType}</span>}
                  </span>
                  <span className="block text-[12.5px] text-muted truncate">{[l.email, l.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-[11.5px] font-semibold text-muted bg-chip rounded-full px-2 py-0.5">{STATUS_LABEL[l.status]}</span>
                <span className="text-[12px] text-muted w-[60px] text-right">{new Date(l.submittedAt ?? l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
