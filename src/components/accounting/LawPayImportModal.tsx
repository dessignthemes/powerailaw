"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Upload, CheckCircle2 } from "lucide-react";

type Line = {
  ref: string; date: string; amount: number; fee: number; type: "payment" | "refund"; account: "operating" | "trust" | null; payer: string; reference: string; method: "card" | "ach";
  action: "invoice" | "income" | "trust" | "refund"; invoice: { number: string; why: string } | null; client: { name: string } | null; duplicate: boolean;
};
type Preview = { lines: Line[]; skipped: { reason: string; count: number }[]; hasAccountColumn: boolean };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// AI Accountant → + Add → Import from LawPay.
export default function LawPayImportModal({ onClose, onImported }: { onClose: () => void; onImported: (msg: string) => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [account, setAccount] = useState<"operating" | "trust">("operating");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function call(body: object) {
    const res = await fetch("/api/accounting/lawpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
    return d;
  }

  async function load(text: string, acct = account) {
    setBusy(true);
    setError(null);
    try {
      setPreview(await call({ csv: text, account: acct, preview: true }));
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    void load(text);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const d = await call({ csv, account });
      const parts = [
        d.invoices ? `${d.invoices} ${d.invoices === 1 ? "invoice" : "invoices"} marked paid` : "",
        d.added ? `${d.added} ${d.added === 1 ? "entry" : "entries"} added for review` : "",
        d.duplicates ? `${d.duplicates} already imported` : "",
      ].filter(Boolean);
      onImported(`LawPay import: ${parts.join(", ") || "nothing new"}.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const fresh = preview?.lines.filter((l) => !l.duplicate) ?? [];
  const count = (a: Line["action"]) => fresh.filter((l) => l.action === a).length;
  const fees = fresh.reduce((n, l) => n + l.fee, 0);
  const where = (l: Line) =>
    l.action === "invoice"
      ? { text: `Pays ${l.invoice?.number}`, sub: l.invoice?.why ?? "", tone: "text-[#155C3A]" }
      : l.action === "trust"
        ? { text: "Trust deposit", sub: l.client ? `for ${l.client.name}` : "link it to a client", tone: "" }
        : l.action === "refund"
          ? { text: "Refund (money out)", sub: "to review", tone: "text-[#8A4B14]" }
          : { text: "Fee income", sub: l.client ? `${l.client.name} · no open invoice matched` : "to review: link a client or invoice", tone: "" };

  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[920px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import from LawPay">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 sticky top-0 bg-white border-b border-line">
          <h2 className="text-[17px] font-semibold">Import from LawPay</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 text-[13.5px]">
          {!preview && (
            <>
              <ol className="list-decimal pl-5 text-muted space-y-1 mb-4">
                <li>
                  Sign in to <b className="text-ink">LawPay</b> → <b className="text-ink">Reports</b> → <b className="text-ink">Transactions</b>.
                </li>
                <li>Pick the dates (e.g. last month) and export to <b className="text-ink">CSV</b>.</li>
                <li>Choose that file below. You&apos;ll see what will happen before anything is saved.</li>
              </ol>
              <button onClick={() => input.current?.click()} disabled={busy} className="w-full border-2 border-dashed border-btn rounded-2xl py-8 flex flex-col items-center gap-1.5 hover:bg-card-alt">
                {busy ? <Loader2 size={18} className="animate-spin text-muted" /> : <Upload size={18} className="text-muted" />}
                <span className="text-[14px] font-medium">{busy ? "Reading the file…" : "Choose the LawPay CSV file"}</span>
              </button>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            </>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-medium">{fileName}</span>
                <span className="text-muted">· {preview.lines.length} transactions</span>
                <button onClick={() => (setPreview(null), setCsv(""))} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
                  Choose another file
                </button>
              </div>
              {!preview.hasAccountColumn && (
                <label className="flex items-center gap-2 mb-3 bg-[#FFF8EE] border border-[#F6D4A6] rounded-xl px-3 py-2">
                  This file doesn&apos;t say which account the money went to. It went to:
                  <select value={account} onChange={(e) => (setAccount(e.target.value as "operating" | "trust"), void load(csv, e.target.value as "operating" | "trust"))} className="bg-white border border-line rounded-lg px-2 py-1">
                    <option value="operating">Operating</option>
                    <option value="trust">Trust (IOLTA)</option>
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[
                  ["Invoices to mark paid", count("invoice")],
                  ["Fee income to review", count("income")],
                  ["Trust deposits", count("trust")],
                  ["Processing fees", money(fees)],
                ].map(([l, v]) => (
                  <div key={l as string} className="bg-card-alt rounded-xl px-3 py-2.5">
                    <div className="text-[12px] text-muted">{l}</div>
                    <div className="text-[17px] font-semibold">{v}</div>
                  </div>
                ))}
              </div>
              <div className="border border-line rounded-xl overflow-hidden max-h-[46vh] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-card-alt text-muted text-left sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Paid by</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium text-right">Fee</th>
                      <th className="px-3 py-2 font-medium">Goes to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => {
                      const w = where(l);
                      return (
                        <tr key={l.ref} className={`border-t border-line ${l.duplicate ? "opacity-45" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap">{shortDate(l.date)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium truncate max-w-[220px]">{l.payer || "—"}</div>
                            <div className="text-[11.5px] text-muted truncate max-w-[220px]">
                              {l.method === "ach" ? "eCheck" : "Card"} · {l.account === "trust" ? "Trust" : "Operating"}
                              {l.reference ? ` · ${l.reference}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {l.type === "refund" ? "−" : ""}
                            {money(l.amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">{l.fee ? money(l.fee) : "—"}</td>
                          <td className="px-3 py-2">
                            {l.duplicate ? (
                              <span className="text-muted">Already imported</span>
                            ) : (
                              <>
                                <div className={`font-medium ${w.tone}`}>{w.text}</div>
                                <div className="text-[11.5px] text-muted">{w.sub}</div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.skipped.length > 0 && <p className="text-[12.5px] text-muted mt-2">Skipped: {preview.skipped.map((s) => `${s.count} ${s.reason}`).join(", ")}.</p>}
              <p className="text-[12.5px] text-muted mt-2">
                Matched payments are recorded on their invoice (it turns Paid). Everything else lands in <b>Review</b> for you to check. Trust deposits stay in Trust and are never
                counted as income. Importing the same file again adds nothing twice.
              </p>
            </>
          )}

          {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
              Cancel
            </button>
            {preview && (
              <button onClick={() => void run()} disabled={busy || !fresh.length} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Import {fresh.length} {fresh.length === 1 ? "transaction" : "transactions"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
