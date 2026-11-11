"use client";

import { useMemo, useState } from "react";
import { X, FileSpreadsheet, Loader2, Check, Search, User, Building2, Landmark, ScrollText, Users } from "lucide-react";
import { readXlsx, readCsv, cardsFromRows, importOrder, type CardRow } from "@/lib/contacts/cardsImport";
import { KIND_NAMES, VENDOR_TYPES, GOVERNMENT_TYPES, type ContactKind } from "@/lib/records/contactTypes";

type Filter = "all" | "person" | "company" | "trust" | "estate" | "client" | "vendor" | "linked";
const BATCH = 500;
const SHOW = 150;

const KIND_ICON: Record<ContactKind, typeof User> = { person: User, company: Building2, trust: Landmark, estate: ScrollText };

// Import a firm's card list (Excel .xlsx or .csv, e.g. "Card Details"): every card is sorted into
// person / company / trust / estate and client / vendor, people are put under their company,
// and the person importing can change anything before saving.
export default function CardsImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; linked: number } | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setReading(true);
    setFileName(f.name);
    try {
      const rows = /\.csv$/i.test(f.name) ? readCsv(await f.text()) : readXlsx(new Uint8Array(await f.arrayBuffer()));
      const list = cardsFromRows(rows);
      if (!list.length) throw new Error("No cards with a name were found in that file.");
      setCards(list);
    } catch (err) {
      setError((err as Error).message || "That file couldn't be read.");
    } finally {
      setReading(false);
    }
  }

  const counts = useMemo(() => {
    const c = { all: 0, person: 0, company: 0, trust: 0, estate: 0, client: 0, vendor: 0, linked: 0 } as Record<Filter, number>;
    const vt: Record<string, number> = {};
    for (const x of cards ?? []) {
      c.all++;
      c[x.kind]++;
      if (x.category === "client" || x.category === "vendor") c[x.category]++;
      if (x.employerKey) c.linked++;
      if (x.vendorType && x.kind !== "person") vt[x.vendorType] = (vt[x.vendorType] ?? 0) + 1;
    }
    return { c, vt };
  }, [cards]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (cards ?? []).filter(
      (x) =>
        (filter === "all" || x.kind === filter || x.category === filter || (filter === "linked" && !!x.employerKey)) &&
        words.every((w) => `${x.name} ${x.shortName} ${x.email ?? ""} ${x.vendorType} ${x.employerName}`.toLowerCase().includes(w)),
    );
  }, [cards, filter, q]);

  const change = (key: string, patch: Partial<CardRow>) =>
    setCards((list) =>
      (list ?? []).map((x) => {
        if (x.key !== key) return x;
        const next = { ...x, ...patch };
        if (next.category !== "vendor") next.vendorType = "";
        if (next.kind !== "person") {
          next.employerKey = null;
          next.employerName = "";
        }
        return next;
      }),
    );

  async function run() {
    if (!cards?.length) return;
    const ordered = importOrder(cards);
    setError(null);
    setProgress({ done: 0, total: ordered.length });
    const total = { added: 0, skipped: 0, linked: 0 };
    for (let i = 0; i < ordered.length; i += BATCH) {
      const res = await fetch("/api/contacts/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: ordered.slice(i, i + BATCH) }),
      }).catch(() => null);
      const d = (await res?.json().catch(() => null)) as { added?: number; skipped?: number; linked?: number; error?: string } | null;
      if (!res?.ok) {
        setError(`${d?.error ?? "The import stopped."} ${total.added ? `${total.added.toLocaleString()} cards were saved before it stopped; importing the file again skips them.` : ""}`);
        setProgress(null);
        if (total.added) onImported();
        return;
      }
      total.added += d?.added ?? 0;
      total.skipped += d?.skipped ?? 0;
      total.linked += d?.linked ?? 0;
      setProgress({ done: Math.min(i + BATCH, ordered.length), total: ordered.length });
    }
    setProgress(null);
    setResult(total);
    onImported();
  }

  const chip = (k: Filter, label: string) => (
    <button
      key={k}
      onClick={() => setFilter(k)}
      className={`px-2.5 py-1 rounded-full text-[12.5px] font-medium border transition-colors ${
        filter === k ? "bg-btn border-btn text-ink" : "bg-white border-[#E7E2D7] text-ink hover:bg-chip"
      }`}
    >
      {label} <span className="text-muted font-normal">{counts.c[k].toLocaleString()}</span>
    </button>
  );
  const busy = !!progress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-[980px] max-h-full flex flex-col p-7">
        <div className="flex items-start justify-between mb-1.5">
          <h2 className="text-[21px] font-semibold flex items-center gap-2">
            <FileSpreadsheet size={20} strokeWidth={1.75} /> Import from Excel (Cards)
          </h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="text-muted hover:text-ink disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col items-center justify-center text-center py-14">
            <span className="w-11 h-11 rounded-full bg-[#E8F6EE] text-[#1F7A4D] flex items-center justify-center mb-3">
              <Check size={20} />
            </span>
            <div className="text-[18px] font-semibold mb-1.5">{result.added.toLocaleString()} cards imported</div>
            <p className="text-[14px] text-muted">
              {result.linked ? `${result.linked.toLocaleString()} people put under their company. ` : ""}
              {result.skipped ? `${result.skipped.toLocaleString()} were already in Contacts and were skipped.` : ""}
            </p>
            <button onClick={onClose} className="mt-5 bg-btn hover:bg-btn-hover border border-btn px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors">
              Done
            </button>
          </div>
        ) : !cards ? (
          <>
            <p className="text-[13.5px] text-muted mb-5 max-w-[720px]">
              Choose the Excel (.xlsx) or CSV export of your card list, for example <b className="text-ink">Card Details</b>. Each card is sorted into a{" "}
              <b className="text-ink">person, company, trust or estate</b>, and into <b className="text-ink">client</b> (included in conflict checks) or{" "}
              <b className="text-ink">vendor</b> (title companies, law firms, lenders, realtors…). People are put under their company when they share its email
              domain or the file has a Company column. You review everything before it&apos;s saved.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-btn bg-[#F7F6F2] hover:bg-[#F3F1EC] transition-colors py-12 cursor-pointer">
              {reading ? <Loader2 size={22} className="animate-spin text-muted" /> : <FileSpreadsheet size={24} strokeWidth={1.5} className="text-muted" />}
              <span className="text-[14px] font-medium">{reading ? `Reading ${fileName}…` : "Choose a file"}</span>
              <span className="text-[12.5px] text-muted">.xlsx or .csv · columns like Short Name, Card Name, Card Type, Supplier, Email, Town/City, State, Zip Code, Phone</span>
              <input type="file" accept=".xlsx,.csv" onChange={pick} disabled={reading} className="hidden" />
            </label>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted mb-3">
              <b className="text-ink">{fileName}</b>: {counts.c.all.toLocaleString()} cards. Check the groups below and change anything that&apos;s wrong, then import.
            </p>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {(["person", "company", "trust", "estate"] as const).map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <div key={k} className="rounded-xl bg-[#F7F6F2] border border-[#EEEBE4] px-3 py-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted flex items-center gap-1.5">
                      <Icon size={12} /> {k === "person" ? "People" : k === "company" ? "Companies" : k === "trust" ? "Trusts" : "Estates"}
                    </div>
                    <div className="text-[18px] font-semibold tabular-nums">{counts.c[k].toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-[12.5px] text-muted mb-3">
              <b className="text-[#1F7A4D]">{counts.c.client.toLocaleString()} clients</b> (checked for conflicts) ·{" "}
              <b className="text-[#8A4B14]">{counts.c.vendor.toLocaleString()} vendors</b>
              {Object.keys(counts.vt).length > 0 && (
                <> ({Object.entries(counts.vt).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ")})</>
              )}
              {" · "}
              <span className="inline-flex items-center gap-1"><Users size={12} /> {counts.c.linked.toLocaleString()} people under their company</span>
            </div>

            {/* Filters + search */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {chip("all", "All")}
              {chip("client", "Clients")}
              {chip("vendor", "Vendors")}
              {chip("company", "Companies")}
              {chip("person", "People")}
              {chip("trust", "Trusts")}
              {chip("estate", "Estates")}
              {chip("linked", "Under a company")}
              <div className="ml-auto flex items-center gap-2 bg-[#F7F6F2] border border-[#ECE9E1] rounded-full px-3 py-1.5 w-[220px] focus-within:bg-white focus-within:border-[#D7D1C0]">
                <Search size={13} className="text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card" className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" />
              </div>
            </div>

            {/* Rows */}
            <div className="flex-1 min-h-[200px] overflow-y-auto rounded-xl border border-[#ECE9E1]">
              <div className="grid grid-cols-[1fr_120px_120px_170px] gap-2 px-3 py-2 bg-[#F7F6F2] border-b border-[#EEEBE4] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted sticky top-0">
                <span>Name</span>
                <span>Type</span>
                <span>Group</span>
                <span>Vendor type / works at</span>
              </div>
              {shown.slice(0, SHOW).map((x) => (
                <div key={x.key} className="grid grid-cols-[1fr_120px_120px_170px] gap-2 items-center px-3 py-1.5 border-b border-[#F3F1EB] text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{x.name}</div>
                    <div className="truncate text-[11.5px] text-muted">{[x.email, x.phone, [x.city, x.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
                  </div>
                  <select value={x.kind} onChange={(e) => change(x.key, { kind: e.target.value as ContactKind })} className="bg-white border border-[#E7E2D7] rounded-lg px-2 py-1 text-[12.5px]">
                    {(["person", "company", "trust", "estate"] as const).map((k) => (
                      <option key={k} value={k}>{KIND_NAMES[k]}</option>
                    ))}
                  </select>
                  <select
                    value={x.category}
                    onChange={(e) => change(x.key, { category: e.target.value as CardRow["category"] })}
                    className={`border rounded-lg px-2 py-1 text-[12.5px] ${x.category === "vendor" ? "bg-[#FFF4E5] border-[#F6D4A6]" : x.category === "government" ? "bg-[#EAF0FB] border-[#C5D3EE]" : x.category === "client" ? "bg-[#E8F6EE] border-[#B9D6B2]" : "bg-white border-[#E7E2D7]"}`}
                  >
                    <option value="client">Client</option>
                    <option value="vendor">Vendor</option>
                    <option value="government">Government</option>
                    <option value="other">Other</option>
                  </select>
                  {(x.category === "vendor" || x.category === "government") && x.kind !== "person" ? (
                    <select value={x.vendorType} onChange={(e) => change(x.key, { vendorType: e.target.value })} className="bg-white border border-[#E7E2D7] rounded-lg px-2 py-1 text-[12.5px] min-w-0">
                      <option value="">{x.category === "government" ? "Office type" : "Vendor type"}</option>
                      {(x.category === "government" ? GOVERNMENT_TYPES : VENDOR_TYPES).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="truncate text-[12px] text-muted" title={x.employerName}>
                      {x.employerKey ? `at ${x.employerName}` : x.vendorType || ""}
                    </span>
                  )}
                </div>
              ))}
              {shown.length > SHOW && (
                <div className="px-3 py-2.5 text-[12px] text-muted">
                  Showing {SHOW} of {shown.length.toLocaleString()}. Use the filters or search to find a card; everything is imported.
                </div>
              )}
              {!shown.length && <div className="px-3 py-6 text-center text-[13px] text-muted">No cards match.</div>}
            </div>

            {error && <div className="mt-3 rounded-xl bg-[#FDECEC] border border-[#F6C9C9] text-[#9F1D1D] px-3.5 py-2.5 text-[13px]">{error}</div>}

            <div className="flex items-center gap-3 mt-4">
              {progress ? (
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-[#F3F1EC] overflow-hidden">
                    <div className="h-full bg-[#C8BEA6] transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                  <div className="text-[12px] text-muted mt-1">
                    Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()}… Keep this window open.
                  </div>
                </div>
              ) : (
                <button onClick={() => setCards(null)} className="bg-chip hover:bg-btn border border-btn px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">
                  Choose another file
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={run}
                disabled={busy}
                className="bg-btn hover:bg-btn-hover border border-btn px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} Import {counts.c.all.toLocaleString()} cards
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
