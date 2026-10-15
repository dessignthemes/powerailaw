"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Upload, Check, AlertTriangle } from "lucide-react";
import { readLeapTable, defaultMapping, rowsFromTable, FIELD_TARGETS, type LeapRow, type FieldTarget, type LeapTable } from "@/lib/matters/leapImport";

type Result = { created: number; updated: number; skipped: string[]; failed: { number: string; error: string }[]; clientsCreated: number; clientsUpdated: number };
const EMPTY_TABLE: LeapTable = { headers: null, records: [] };

// Paste rows copied from LEAP's matter list (or choose a CSV), check the preview, import.
export default function ImportLeapModal({ existingNumbers, onClose, onDone }: { existingNumbers: Set<string>; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // The file as columns, and what each column means (guessed from its header; changeable).
  const [table, setTable] = useState<LeapTable>(EMPTY_TABLE);
  const [mapping, setMapping] = useState<FieldTarget[]>([]);
  const rows = useMemo(() => rowsFromTable(table, mapping), [table, mapping]);

  // New text: rows start ticked, except file complete / not proceeding (matters already in
  // LawPower are ticked too: they get the information they're missing).
  function takeText(t: string) {
    setText(t);
    const tb = readLeapTable(t);
    const mp = defaultMapping(tb);
    setTable(tb);
    setMapping(mp);
    setPicked(new Set(rowsFromTable(tb, mp).filter((r) => !r.closed || existingNumbers.has(r.number)).map((r) => r.number)));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const toggle = (n: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const closedCount = rows.filter((r) => r.closed && !existingNumbers.has(r.number)).length;
  const closedIncluded = rows.some((r) => r.closed && picked.has(r.number));

  // Sent 200 rows at a time (each a short request), so big LEAP files go through.
  async function importNow() {
    const chosen: LeapRow[] = rows.filter((r) => picked.has(r.number));
    if (!chosen.length) return;
    setBusy(true);
    setError(null);
    const total: Result = { created: 0, updated: 0, skipped: [], failed: [], clientsCreated: 0, clientsUpdated: 0 };
    const CHUNK = 200;
    for (let i = 0; i < chosen.length; i += CHUNK) {
      const part = chosen.slice(i, i + CHUNK);
      setProgress(`Importing ${Math.min(i + part.length, chosen.length).toLocaleString()} of ${chosen.length.toLocaleString()}…`);
      try {
        const r = await fetch("/api/matters/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: part }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "This part didn't go through.");
        const res = d as Result;
        total.created += res.created;
        total.updated += res.updated ?? 0;
        total.clientsCreated += res.clientsCreated;
        total.clientsUpdated += res.clientsUpdated ?? 0;
        total.skipped.push(...res.skipped);
        total.failed.push(...res.failed);
      } catch (e) {
        // Keep going with the rest; these rows can be imported again later (nothing is duplicated).
        total.failed.push(...part.map((p) => ({ number: p.number, error: (e as Error).message })));
      }
    }
    setProgress(null);
    setBusy(false);
    setResult(total);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import matters from LEAP" className="bg-cream rounded-3xl w-full max-w-[1100px] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <div className="text-[18px] font-semibold">Import matters from LEAP</div>
            <div className="text-[13px] text-muted">Matters keep their LEAP number. Clients are matched by name or created; the property and the other side go into Details.</div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="px-6 pb-6">
            <div className="rounded-2xl bg-[#E8F6EE] px-5 py-4 text-[14px] flex gap-2">
              <Check size={18} className="text-[#2F9E5A] flex-shrink-0" />
              <div>
                <b>{result.created}</b> new {result.created === 1 ? "matter" : "matters"} imported
                {result.updated ? <>, <b>{result.updated}</b> existing {result.updated === 1 ? "matter" : "matters"} filled in</> : null}
                {result.clientsCreated ? `, ${result.clientsCreated} new ${result.clientsCreated === 1 ? "client" : "clients"}` : ""}
                {result.clientsUpdated ? `, ${result.clientsUpdated} client ${result.clientsUpdated === 1 ? "card" : "cards"} completed` : ""}.
                {result.skipped.length > 0 && ` ${result.skipped.length} already had everything.`}
                <div className="text-[13px] text-muted mt-1">Open a matter to add tasks from a template, or click Fill from documents once its contract is uploaded.</div>
              </div>
            </div>
            {result.failed.length > 0 && (
              <div className="mt-3 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13px] max-h-[160px] overflow-y-auto">
                <b>{result.failed.length} not imported.</b> Paste the same list again and click Import: matters already imported are skipped, so only these are retried.
                <div className="mt-1 text-[12px]">{result.failed.slice(0, 50).map((f) => `${f.number} (${f.error})`).join("; ")}{result.failed.length > 50 ? " …" : ""}</div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => (setResult(null), takeText(""))} className="px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-chip">
                Import more
              </button>
              <button onClick={onClose} className="bg-btn hover:bg-btn-hover px-5 py-2 rounded-full text-[13.5px] font-medium">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 flex flex-col gap-2">
              <div className="text-[13px] text-muted">
                In LEAP, search (e.g. <b>rep-2026</b>), select the rows, copy them (<b>Ctrl+C</b> / <b>Cmd+C</b>) and paste here, or choose a CSV file.
              </div>
              <textarea
                value={text}
                onChange={(e) => takeText(e.target.value)}
                rows={rows.length ? 4 : 8}
                placeholder={"REP-2026-3612\tStarr\tPurchase - Residential - 333 Maria Drive, Toms River\tZampini\tPR\tIN PROGRESS"}
                className="w-full bg-white border border-line rounded-xl px-3 py-2.5 text-[12.5px] font-mono outline-none resize-y"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer">
                  <Upload size={13} /> Choose a CSV file
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/plain"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (f.size > 5_000_000) return setError("That file is too large (5 MB max).");
                      takeText(await f.text());
                    }}
                  />
                </label>
                <span className="text-[12px] text-muted">Excel file? Copy its rows and paste them, or save it as CSV.</span>
              </div>
              {table.headers && table.headers.length > 0 && (
                <details open className="bg-card-alt rounded-xl px-3.5 py-2.5">
                  <summary className="text-[13px] font-semibold cursor-pointer">
                    Columns ({table.headers.length}) · check what each one is
                  </summary>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {table.headers.map((h, i) => {
                      const sample = table.records.find((r) => (r[i] ?? "").trim())?.[i]?.trim() ?? "";
                      return (
                        <label key={i} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-[38%] min-w-0 truncate font-medium" title={sample ? `e.g. ${sample}` : undefined}>
                            {h || `Column ${i + 1}`}
                            {sample && <span className="block text-[11px] text-muted font-normal truncate">e.g. {sample}</span>}
                          </span>
                          <select
                            value={mapping[i] ?? "keep"}
                            onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as FieldTarget) : x)))}
                            aria-label={`What "${h}" is`}
                            className="flex-1 min-w-0 bg-white border border-line rounded-lg px-2 py-1 text-[12.5px] outline-none"
                          >
                            {FIELD_TARGETS.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-6 mt-4">
              {rows.length > 0 ? (
                <table className="w-full text-[13px] border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-cream">
                    <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted">
                      <th className="py-2 pr-2 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={rows.length > 0 && rows.every((r) => picked.has(r.number))}
                          onChange={(e) => setPicked(new Set(e.target.checked ? rows.map((r) => r.number) : []))}
                        />
                      </th>
                      <th className="py-2 pr-3">No.</th>
                      <th className="py-2 pr-3">Client</th>
                      <th className="py-2 pr-3">Property</th>
                      <th className="py-2 pr-3">Other side</th>
                      <th className="py-2 pr-3">Also</th>
                      <th className="py-2 pr-3">LEAP status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const exists = existingNumbers.has(r.number);
                      return (
                        <tr key={r.number} className={!picked.has(r.number) ? "text-muted" : ""}>
                          <td className="py-1.5 pr-2 border-t border-line">
                            <input type="checkbox" checked={picked.has(r.number)} onChange={() => toggle(r.number)} aria-label={`Import ${r.number}`} />
                          </td>
                          <td className="py-1.5 pr-3 border-t border-line font-medium whitespace-nowrap">{r.number}</td>
                          <td className="py-1.5 pr-3 border-t border-line">{r.client}</td>
                          <td className="py-1.5 pr-3 border-t border-line">{r.address || r.matterType}</td>
                          <td className="py-1.5 pr-3 border-t border-line">{r.other}</td>
                          <td className="py-1.5 pr-3 border-t border-line text-[12px] text-muted">
                            {[
                              r.fields.clientEmail && "email",
                              (r.fields.clientPhone || r.fields.clientCell) && "phone",
                              (r.fields.clientStreet || r.fields.clientCity) && "address",
                              r.fields.mailingAddress && "mailing",
                              (r.fields.otherAttorneyName || r.fields.otherAttorneyFirm) && "attorney",
                              Object.keys(r.extras).length > 0 && `+${Object.keys(r.extras).length} more`,
                            ]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </td>
                          <td className="py-1.5 pr-3 border-t border-line whitespace-nowrap">
                            {exists ? <span className="text-[#1F3A93] font-medium">Update (fills blanks)</span> : r.leapStatus || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : text.trim() && table.records.length ? (
                <div className="flex items-start gap-2 text-[13px] text-[#8A4B14] bg-[#FDF1E7] rounded-xl px-4 py-3">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> No matter numbers found (like REP-2026-3612). Copy whole rows from LEAP&apos;s matter list, including the No. column.
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 border-t border-line flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-muted flex-1 min-w-[260px]">
                {rows.length
                  ? `${rows.length} found · ${rows.filter((r) => picked.has(r.number) && !existingNumbers.has(r.number)).length} new · ${rows.filter((r) => picked.has(r.number) && existingNumbers.has(r.number)).length} to update`
                  : "Nothing pasted yet."}
                {closedCount > 0 && !closedIncluded && ` · ${closedCount} file complete / not proceeding left out (tick them to include)`}
              </span>
              {error && <span className="text-[13px] text-[#B42318] basis-full">{error}</span>}
              <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-chip">
                Cancel
              </button>
              <button
                onClick={() => void importNow()}
                disabled={busy || picked.size === 0}
                className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-5 py-2 rounded-full text-[13.5px] font-medium"
              >
                {busy && <Loader2 size={13} className="animate-spin" />} {progress ?? `Import ${picked.size ? picked.size.toLocaleString() : ""} ${picked.size === 1 ? "matter" : "matters"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
