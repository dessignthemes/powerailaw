"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Upload, FileSpreadsheet } from "lucide-react";
import SelectBox from "@/components/SelectBox";
import { ACCOUNT_LABEL, detectColumns, money, parseCsv, rowsFromCsv, type Account, type ColumnMap } from "@/lib/accounting/core";

export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (msg: string) => void }) {
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ColumnMap>({ date: -1, description: -1, amount: -1, debit: -1, credit: -1 });
  const [account, setAccount] = useState<Account>("operating");
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function pick(file: File) {
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) return setError("Choose the CSV file your bank or card exports (Download → CSV).");
    if (file.size > 5 * 1024 * 1024) return setError("That file is larger than 5 MB. Export a shorter date range.");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError("No transactions were found in that file.");
    // Some banks put a few lines of account info above the real header.
    const headerAt = rows.findIndex((r) => { const m = detectColumns(r); return m.date >= 0 && (m.amount >= 0 || m.debit >= 0 || m.credit >= 0); });
    const t = headerAt > 0 ? rows.slice(headerAt) : rows;
    setTable(t);
    setFileName(file.name);
    setMap(detectColumns(t[0]));
    if (/card|amex|visa|mastercard|discover/i.test(file.name)) setAccount("credit_card");
  }

  const parsed = useMemo(() => (table ? rowsFromCsv(table, map, flip) : { rows: [], skipped: 0 }), [table, map, flip]);
  const header = table?.[0] ?? [];
  const ready = map.date >= 0 && map.description >= 0 && (map.amount >= 0 || map.debit >= 0 || map.credit >= 0) && parsed.rows.length > 0;
  const moneyIn = parsed.rows.filter((r) => r.kind === "income").reduce((a, r) => a + r.amount, 0);
  const moneyOut = parsed.rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amount, 0);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      let added = 0, duplicates = 0;
      for (let i = 0; i < parsed.rows.length; i += 400) {
        const res = await fetch("/api/accounting/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account, rows: parsed.rows.slice(i, i + 400) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error ?? "The import failed.");
        added += d.added;
        duplicates += d.duplicates;
      }
      onImported(`Imported ${added} transaction(s)${duplicates ? `, skipped ${duplicates} already imported` : ""}. The AI's suggestions are waiting in Review.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const colSelect = (label: string, key: keyof ColumnMap, optional = false) => (
    <div>
      <div className="text-[12.5px] font-medium mb-1">{label}</div>
      <SelectBox label={label} value={String(map[key])} onChange={(v) => setMap({ ...map, [key]: Number(v) })}>
        <option value="-1">{optional ? "Not used" : "Choose column"}</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </SelectBox>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[720px] max-h-full overflow-y-auto p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[20px] font-semibold">Import bank or card transactions</h2>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[13.5px] text-muted mb-5">
          In your bank or card website, download transactions as a CSV file, then drop it here. The AI suggests a category for every line; you review
          them before anything counts.
        </p>

        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {!table ? (
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); }}
            className="w-full border-2 border-dashed border-line rounded-xl py-10 flex flex-col items-center gap-2 bg-white/60 hover:bg-card-alt/60 transition-colors"
          >
            <Upload size={22} strokeWidth={1.5} className="text-muted" />
            <span className="text-[14px] font-medium">Drop a CSV file or click to choose</span>
            <span className="text-[12.5px] text-muted">Works with most US banks and cards</span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 text-[13.5px]">
              <FileSpreadsheet size={16} strokeWidth={1.75} className="text-muted" />
              <span className="font-medium truncate">{fileName}</span>
              <button onClick={() => { setTable(null); setFileName(""); }} className="text-[12.5px] text-muted hover:text-ink ml-1">
                Choose another
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              {colSelect("Date", "date")}
              {colSelect("Description", "description")}
              {colSelect("Amount (one column)", "amount", true)}
              {map.amount < 0 && colSelect("Money out (debit)", "debit", true)}
              {map.amount < 0 && colSelect("Money in (credit)", "credit", true)}
              <div>
                <div className="text-[12.5px] font-medium mb-1">Which account?</div>
                <SelectBox label="Account" value={account} onChange={(v) => setAccount(v as Account)}>
                  {(Object.keys(ACCOUNT_LABEL) as Account[]).map((a) => (
                    <option key={a} value={a}>
                      {ACCOUNT_LABEL[a]}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>
            {map.amount >= 0 && (
              <label className="flex items-center gap-2 text-[13px] mb-3">
                <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} className="w-4 h-4 accent-black" />
                Purchases show as positive numbers in this file (common for credit cards)
              </label>
            )}
            {account === "trust" && (
              <div className="mb-3 rounded-xl bg-card-alt px-3.5 py-2.5 text-[13px]">
                Trust (IOLTA) lines are kept separate and never counted as income. They appear in their own sheet for your accountant.
              </div>
            )}
            <div className="rounded-xl border border-line bg-white overflow-hidden mb-2">
              <div className="grid grid-cols-[100px_1fr_110px] gap-3 px-3.5 py-2 text-[12px] font-medium text-muted border-b border-line">
                <span>Date</span><span>Description</span><span className="text-right">Amount</span>
              </div>
              {parsed.rows.slice(0, 6).map((r, i) => (
                <div key={i} className="grid grid-cols-[100px_1fr_110px] gap-3 px-3.5 py-2 text-[13px] border-b border-line last:border-0">
                  <span>{r.date}</span>
                  <span className="truncate">{r.description}</span>
                  <span className={`text-right tabular-nums ${r.kind === "income" ? "text-green-700" : ""}`}>{r.kind === "income" ? "+" : "−"}{money(r.amount)}</span>
                </div>
              ))}
              {parsed.rows.length === 0 && <div className="px-3.5 py-4 text-[13px] text-muted">Choose the date, description and amount columns.</div>}
            </div>
            <div className="text-[12.5px] text-muted">
              {parsed.rows.length} transaction(s): {money(moneyIn)} in, {money(moneyOut)} out{parsed.skipped ? ` · ${parsed.skipped} line(s) without a date or amount skipped` : ""}
            </div>
          </>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={busy} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">
            Cancel
          </button>
          <button onClick={go} disabled={!ready || busy} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover flex items-center gap-1.5 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Importing and categorizing…" : `Import ${parsed.rows.length || ""} and categorize`}
          </button>
        </div>
      </div>
    </div>
  );
}
