"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";
import { type Invoice, type InvoiceLine, money, todayIso, addDays, readJson } from "@/components/invoices/shared";

// New invoice for a matter: starts with the flat fee or the billable time not yet
// billed; lines can be changed, removed or added (costs, other).
export default function InvoiceModal({
  matters,
  fixedMatterId,
  onClose,
  onCreated,
  canApprove = true,
}: {
  matters: Matter[];
  fixedMatterId?: string | null;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
  canApprove?: boolean; // the managing attorney (owner / admin) can issue straight away
}) {
  const [matterId, setMatterId] = useState<string>(fixedMatterId ?? "");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<InvoiceLine[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDays(todayIso(), 30));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matter = matters.find((m) => m.id === matterId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // What to bill for the chosen matter.
  useEffect(() => {
    if (!matterId) return;
    let live = true;
    fetch(`/api/invoices/draft?matterId=${matterId}`)
      .then(readJson)
      .then((d: { lines: InvoiceLine[] }) => {
        if (!live) return;
        setLines(d.lines);
        setLoadedFor(matterId);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [matterId]);

  const shownLines = loadedFor === matterId ? lines ?? [] : [];
  const total = shownLines.reduce((n, l) => n + Math.round(l.quantity * l.rate * 100) / 100, 0);
  const options = matters
    .filter((m) => m.status !== "Closed" || m.id === matterId)
    .filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40);

  const setLine = (i: number, patch: Partial<InvoiceLine>) => setLines((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function create(stage: "draft" | "pending" | "issue") {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId, issueDate, dueDate, notes, lines: shownLines, stage }),
      }).then(readJson);
      onCreated(d.invoice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-btn-ring";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[820px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New invoice">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 sticky top-0 bg-white z-10">
          <h2 className="text-[17px] font-semibold">New invoice{matter ? ` · ${matter.matterNumber ?? matter.title}` : ""}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">
          {!matterId ? (
            <div>
              <div className="font-medium mb-2">Which matter is this invoice for?</div>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matter number or name" className={`${input} w-full mb-2`} />
              <div className="border border-line rounded-xl max-h-[320px] overflow-y-auto">
                {options.length === 0 ? (
                  <div className="px-3 py-3 text-muted">No matching matters.</div>
                ) : (
                  options.map((m) => (
                    <button key={m.id} onClick={() => setMatterId(m.id)} className="w-full text-left flex gap-2 px-3 py-2 hover:bg-chip border-b border-line last:border-0">
                      {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                      <span className="truncate text-muted">{m.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : loadedFor !== matterId && !error ? (
            <div className="text-muted flex items-center gap-2 py-6">
              <Loader2 size={14} className="animate-spin" /> Gathering what to bill…
            </div>
          ) : (
            <>
              {matter && (
                <p className="text-muted mb-4">
                  {matter.billingType === "Flat fee"
                    ? "Flat-fee matter: the flat fee is filled in (once per matter). Add costs or other lines if needed."
                    : "Hourly matter: billable time from Time Tracking that hasn't been billed yet is filled in."}
                  {!fixedMatterId && (
                    <button onClick={() => setMatterId("")} className="ml-2 underline underline-offset-2 hover:text-ink">
                      Change matter
                    </button>
                  )}
                </p>
              )}
              <div className="border border-line rounded-xl overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="text-left text-[12px] text-muted bg-card-alt">
                      <th className="font-medium px-3 py-2">Description</th>
                      <th className="font-medium px-2 py-2 w-[90px] text-right">Qty / hours</th>
                      <th className="font-medium px-2 py-2 w-[110px] text-right">Rate</th>
                      <th className="font-medium px-2 py-2 w-[110px] text-right">Amount</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {shownLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-muted">
                          Nothing to bill yet for this matter. Add a line below.
                        </td>
                      </tr>
                    ) : (
                      shownLines.map((l, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-1.5">
                            <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={`${input} w-full`} aria-label="Description" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={`${input} w-full text-right`} aria-label="Quantity" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} className={`${input} w-full text-right`} aria-label="Rate" />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{money(Math.round(l.quantity * l.rate * 100) / 100)}</td>
                          <td className="px-1 py-1.5">
                            <button onClick={() => setLines((ls) => (ls ?? []).filter((_, j) => j !== i))} aria-label="Remove line" className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-2">
                {(
                  [
                    ["cost", "Add a cost"],
                    ["other", "Add a line"],
                  ] as [InvoiceLine["kind"], string][]
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() => setLines((ls) => [...(ls ?? []), { kind, description: kind === "cost" ? "Filing / recording fee" : "", quantity: 1, rate: 0, amount: 0 }])}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium"
                  >
                    <Plus size={12} /> {label}
                  </button>
                ))}
                <div className="ml-auto text-[15px] font-semibold tabular-nums self-center">Total {money(total)}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                <label className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-muted">Invoice date</span>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={input} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-muted">Due date</span>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-3">
                  <span className="text-[12.5px] text-muted">Note on the invoice (optional)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${input} resize-y`} placeholder="e.g. Thank you for your business." />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
                  Cancel
                </button>
                <button onClick={() => void create("draft")} disabled={busy || total <= 0} className="bg-chip hover:bg-btn disabled:opacity-50 px-4 py-2 rounded-full font-medium">
                  Save as draft
                </button>
                {canApprove ? (
                  <button onClick={() => void create("issue")} disabled={busy || total <= 0} title="Approve and issue it now" className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                    {busy && <Loader2 size={14} className="animate-spin" />} Approve &amp; create
                  </button>
                ) : (
                  <button onClick={() => void create("pending")} disabled={busy || total <= 0} title="The managing attorney approves it before it's issued" className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                    {busy && <Loader2 size={14} className="animate-spin" />} Send for approval
                  </button>
                )}
              </div>
            </>
          )}
          {error && <div className="mt-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}
