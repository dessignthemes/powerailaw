"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { type Invoice, money, todayIso, readJson, METHODS } from "@/components/invoices/shared";

// Record money received for an invoice. It goes into AI Accountant → Operating,
// linked to the matter; "From trust" also takes it out of the matter's trust balance.
export default function PaymentModal({ invoice, onClose, onPaid }: { invoice: Invoice; onClose: () => void; onPaid: (inv: Invoice) => void }) {
  const remaining = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState("check");
  const [trust, setTrust] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (method !== "trust" || !invoice.matterId) return;
    let live = true;
    fetch("/api/accounting/trust")
      .then(readJson)
      .then((d: { balances: { matterId: string | null; balance: number }[] }) => live && setTrust(d.balances.find((b) => b.matterId === invoice.matterId)?.balance ?? 0))
      .catch(() => live && setTrust(null));
    return () => {
      live = false;
    };
  }, [method, invoice.matterId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), date, method }),
      }).then(readJson);
      onPaid(d.invoice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Record payment">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-[17px] font-semibold">Record payment · {invoice.number}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">
          <p className="text-muted mb-4">
            Total {money(invoice.total)} · paid so far {money(invoice.amountPaid)} · <b className="text-ink">still owed {money(remaining)}</b>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] text-muted">Amount received</span>
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] text-muted">Date received</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-[12.5px] text-muted">How it was paid</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                {METHODS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {method === "trust" && (
            <p className="mt-3 rounded-xl bg-card-alt px-3.5 py-2.5 text-[13px]">
              Moves earned fees from this matter&apos;s trust balance to operating.{" "}
              {trust === null ? "Checking the trust balance…" : <b>In trust for this matter: {money(trust)}</b>}
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-muted">The payment is added to AI Accountant → Operating, linked to this matter, and the invoice shows as paid on the matter.</p>
          {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
              Cancel
            </button>
            <button onClick={() => void save()} disabled={busy || !(Number(amount) > 0)} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Record payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
