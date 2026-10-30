"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import type { ConflictCheck } from "@/lib/conflicts/check";

// Run a conflict check for a prospect (Contacts → Run conflict check, and the Conflict Checks page).
export default function RunConflictModal({ onClose, onDone, showPastLink = false }: { onClose: () => void; onDone: (c: ConflictCheck) => void; showPastLink?: boolean }) {
  const [names, setNames] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-btn-ring";
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: names.split(/\n|;/).map((x) => x.trim()).filter(Boolean), companies: company ? [company] : [], emails: email ? [email] : [], phones: phone ? [phone] : [], notes }),
      });
      const d = (await r.json().catch(() => ({}))) as { check?: ConflictCheck; error?: string };
      if (!r.ok || !d.check) throw new Error(d.error ?? "The conflict check couldn't be run.");
      onDone(d.check);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-label="Run conflict check" className="bg-page rounded-2xl w-full max-w-[520px] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[18px] font-semibold">Run conflict check</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <p className="text-[13px] text-muted mb-4">
          Checks a prospect against every matter: leads, open and closed.
          {showPastLink && (
            <>
              {" "}
              <Link href="/dashboard/conflict-checks" className="underline underline-offset-2 text-ink">
                See past checks
              </Link>
            </>
          )}
        </p>
        <label className="block text-[12.5px] font-semibold text-muted mb-1">Name(s)</label>
        <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={2} placeholder={"Jan Kowalski\nAnna Kowalska (one per line; add maiden names too)"} className={`${field} resize-none mb-3`} />
        <label className="block text-[12.5px] font-semibold text-muted mb-1">Company</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" className={`${field} mb-3`} />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12.5px] font-semibold text-muted mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className={field} />
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-muted mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className={field} />
          </div>
        </div>
        <label className="block text-[12.5px] font-semibold text-muted mb-1">What the matter is about</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. buying 12 Main St from John Smith" className={`${field} mb-4`} />
        {error && <div className="mb-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3.5 py-2 text-[13px]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-full text-[13.5px] font-medium bg-chip hover:bg-btn">
            Cancel
          </button>
          <button onClick={run} disabled={busy || !(names.trim() || company.trim() || email.trim() || phone.trim())} className="px-4 py-2.5 rounded-full text-[13.5px] font-medium bg-btn hover:bg-btn-hover disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Checking every matter…" : "Run check"}
          </button>
        </div>
      </div>
    </div>
  );
}
