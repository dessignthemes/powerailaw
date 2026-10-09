"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  ChevronDown,
  Upload,
  Receipt,
  PenLine,
  Download,
  Loader2,
  Search,
  X,
  Check,
  Paperclip,
  Sparkles,
  CircleCheck,
  Circle,
  ShieldCheck,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import SelectBox from "@/components/SelectBox";
import TxnModal from "@/components/accounting/TxnModal";
import ImportModal from "@/components/accounting/ImportModal";
import { buildPackage, type TimeRow } from "@/components/accounting/package";
import { ACCOUNT_LABEL, CATEGORIES, catLabel, categoriesFor, money, plOf, readiness, summarize, CAT, type Txn } from "@/lib/accounting/core";

// ── Periods ──
type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "last_quarter", label: "Last quarter" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodRange(k: PeriodKey) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3);
  const r = (a: Date, b: Date, label: string) => ({ from: ymd(a), to: ymd(b), label });
  switch (k) {
    case "this_month": return r(new Date(y, m, 1), new Date(y, m + 1, 0), now.toLocaleString("en-US", { month: "long", year: "numeric" }));
    case "last_month": { const d = new Date(y, m - 1, 1); return r(d, new Date(y, m, 0), d.toLocaleString("en-US", { month: "long", year: "numeric" })); }
    case "this_quarter": return r(new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 0), `Q${q + 1} ${y}`);
    case "last_quarter": { const lq = q === 0 ? 3 : q - 1, ly = q === 0 ? y - 1 : y; return r(new Date(ly, lq * 3, 1), new Date(ly, lq * 3 + 3, 0), `Q${lq + 1} ${ly}`); }
    case "this_year": return r(new Date(y, 0, 1), new Date(y, 11, 31), `${y}`);
    case "last_year": return r(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31), `${y - 1}`);
  }
}

type Tab = "overview" | "review" | "transactions" | "reports";

async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? `Request failed (${res.status})`), { code: d?.code });
  return d;
}

const blackBtn = "bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors flex items-center gap-1.5";
const beigeBtn = "bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors flex items-center gap-1.5";

export default function AiAccountantPage() {
  const { clients, matters } = useWorkspaceData();
  const [period, setPeriod] = useState<PeriodKey>("this_year");
  const range = useMemo(() => periodRange(period), [period]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [time, setTime] = useState<TimeRow[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [addOpen, setAddOpen] = useState(false);
  const [modal, setModal] = useState<null | { kind: "txn"; txn?: Txn; file?: File | null } | { kind: "import" }>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [firm, setFirm] = useState("");

  const key = `${range.from}|${range.to}|${reload}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/accounting?from=${range.from}&to=${range.to}`)
      .then(readJson)
      .then((d) => {
        if (cancelled) return;
        setTxns(d.txns);
        setTime(d.time ?? []);
        setError(null);
        setSetup(false);
      })
      .catch((e: Error & { code?: string }) => {
        if (cancelled) return;
        if (e.code === "setup_required") setSetup(true);
        else setError(e.message);
        setTxns([]);
      })
      .finally(() => !cancelled && setLoadedKey(`${range.from}|${range.to}|${reload}`));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reload]);

  useEffect(() => {
    fetch("/api/organization").then((r) => (r.ok ? r.json() : null)).then((d) => d?.organization?.name && setFirm(d.organization.name)).catch(() => {});
  }, []);

  const clientName = useCallback((id: string | null) => clients.find((c) => c.id === id)?.name ?? "Unknown client", [clients]);
  const matterName = useCallback((id: string | null) => matters.find((m) => m.id === id)?.title ?? "Unknown matter", [matters]);

  const s = useMemo(() => summarize(txns), [txns]);
  const r = useMemo(() => readiness(txns), [txns]);
  const review = txns.filter((t) => t.status === "needs_review");
  const timeValue = time.reduce((a, t) => a + t.valueCents, 0) / 100;

  const upsert = (t: Txn) => setTxns((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [t, ...list]));

  async function patch(t: Txn, body: Partial<Txn>) {
    upsert({ ...t, ...body });
    try {
      const d = await fetch(`/api/accounting/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson);
      upsert(d.txn);
    } catch (e) {
      upsert(t);
      setError((e as Error).message);
    }
  }

  async function bulk(ids: string[], body: Partial<Txn>, msg: string) {
    if (!ids.length) return;
    setTxns((list) => list.map((x) => (ids.includes(x.id) ? { ...x, ...body } : x)));
    try {
      await fetch("/api/accounting/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, patch: body }) }).then(readJson);
      setNotice(msg);
    } catch (e) {
      setError((e as Error).message);
      setReload((n) => n + 1);
    }
  }

  async function exportPackage() {
    setExporting("Preparing…");
    try {
      const blob = await buildPackage({
        firm, periodLabel: range.label, from: range.from, to: range.to, txns, time,
        names: { client: clientName, matter: matterName }, onProgress: setExporting,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(firm || "Law firm").replace(/[\\/:*?"<>|]+/g, "-")} - Accountant package - ${range.label}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setNotice("Your accountant package is downloading: an Excel workbook plus all receipts, ready to send.");
    } catch (e) {
      setError(`The package couldn't be built: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  }

  // Drop a receipt anywhere on the page to add it.
  function onDrop(e: React.DragEvent) {
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (/\.(csv|txt)$/i.test(f.name)) setModal({ kind: "import" });
    else if (/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) setModal({ kind: "txn", file: f });
  }

  return (
    <div className="px-10 py-10" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <h1 className="text-[28px] font-semibold flex items-center gap-2.5">AI Accountant</h1>
          <p className="text-[14.5px] text-muted mt-1 max-w-[720px]">
            Import your bank and card activity and receipts. The AI sorts everything into law-firm categories, you review, and your accountant gets a
            finished package.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[170px]">
            <SelectBox label="Period" value={period} onChange={(v) => setPeriod(v as PeriodKey)}>
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="relative">
            <button onClick={() => setAddOpen(!addOpen)} className={beigeBtn} aria-haspopup="menu" aria-expanded={addOpen}>
              + Add <ChevronDown size={14} strokeWidth={2} />
            </button>
            {addOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)} />
                <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(20,24,33,0.25)] p-1.5">
                  {[
                    { icon: Upload, label: "Import bank or card CSV", hint: "AI categorizes every line", go: () => setModal({ kind: "import" }) },
                    { icon: Receipt, label: "Add a receipt", hint: "PDF receipts are read by AI", go: () => setModal({ kind: "txn" }) },
                    { icon: PenLine, label: "Add manually", hint: "A payment, fee or expense", go: () => setModal({ kind: "txn" }) },
                  ].map((o) => (
                    <button key={o.label} role="menuitem" onClick={() => { setAddOpen(false); o.go(); }} className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-chip">
                      <o.icon size={16} strokeWidth={1.75} className="mt-0.5 text-muted" />
                      <span>
                        <span className="block text-[13.5px] font-medium">{o.label}</span>
                        <span className="block text-[12px] text-muted">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={exportPackage} disabled={!!exporting || loading || setup || txns.length === 0} className={`${blackBtn} disabled:opacity-50`}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2} />}
            {exporting ?? "Accountant package"}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line mt-6 mb-6">
        {([
          ["overview", "Overview"],
          ["review", `Review${review.length ? ` (${review.length})` : ""}`],
          ["transactions", "Transactions"],
          ["reports", "Reports"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-[14px] font-medium -mb-px border-b-2 transition-colors ${tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {setup && (
        <div className="mb-5 rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">
          The AI Accountant needs a one-time database update. Run <span className="font-medium">supabase/migrations/0017_ai_accountant.sql</span> in the Supabase SQL editor, then refresh.
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}

      {loading ? (
        <div className="bg-card-alt rounded-2xl py-16 text-center text-[14px] text-muted">Loading the books…</div>
      ) : tab === "overview" ? (
        <Overview
          s={s} r={r} timeValue={timeValue} count={txns.length} reviewCount={review.length} periodLabel={range.label}
          onImport={() => setModal({ kind: "import" })} onReceipt={() => setModal({ kind: "txn" })} onReview={() => setTab("review")}
        />
      ) : tab === "review" ? (
        <ReviewList
          items={review} clientName={clientName}
          onApprove={(t) => patch(t, { status: "ready" })}
          onExclude={(t) => patch(t, { status: "excluded" })}
          onCategory={(t, c) => patch(t, { category: c, kind: CAT[c].kind === "transfer" ? "transfer" : t.kind === "transfer" ? CAT[c].kind : t.kind, reimbursable: c === "client_costs" ? true : t.reimbursable })}
          onOpen={(t) => setModal({ kind: "txn", txn: t })}
          onApproveConfident={() => {
            const ids = review.filter((t) => t.category !== "uncategorized" && (t.aiConfidence ?? 0) >= 0.85).map((t) => t.id);
            bulk(ids, { status: "ready" }, `Approved ${ids.length} confident suggestion(s).`);
          }}
        />
      ) : tab === "transactions" ? (
        <TxnTable txns={txns} clientName={clientName} matterName={matterName} onOpen={(t) => setModal({ kind: "txn", txn: t })} onCategory={(t, c) => patch(t, { category: c, status: "ready" })} />
      ) : (
        <Reports s={s} time={time} clientName={clientName} matterName={matterName} />
      )}

      <p className="mt-10 flex items-start gap-2 text-[12px] text-muted max-w-[760px]">
        <ShieldCheck size={14} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
        The AI Accountant organizes your records for your accountant. Categories are suggestions you review; it is not tax or accounting advice, and
        your accountant decides the final treatment. Trust (IOLTA) money is kept separate and never counted as income.
      </p>

      {modal?.kind === "txn" && (
        <TxnModal
          txn={modal.txn}
          initialFile={modal.file}
          clients={clients}
          matters={matters}
          onClose={() => setModal(null)}
          onSaved={(t) => {
            setModal(null);
            if (t.date >= range.from && t.date <= range.to) upsert(t);
            else setNotice(`Saved. It's dated ${t.date}, outside ${range.label}.`);
          }}
          onDeleted={(id) => {
            setModal(null);
            setTxns((l) => l.filter((x) => x.id !== id));
          }}
        />
      )}
      {modal?.kind === "import" && (
        <ImportModal
          onClose={() => setModal(null)}
          onImported={(msg) => {
            setModal(null);
            setNotice(msg);
            setTab("review");
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// ── Overview ──
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card-alt rounded-2xl p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[26px] font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Overview(p: {
  s: ReturnType<typeof summarize>; r: ReturnType<typeof readiness>; timeValue: number; count: number; reviewCount: number; periodLabel: string;
  onImport: () => void; onReceipt: () => void; onReview: () => void;
}) {
  if (p.count === 0) {
    return (
      <div className="bg-card-alt rounded-2xl p-8">
        <div className="flex items-center gap-2 text-[17px] font-semibold mb-1"><Calculator size={18} strokeWidth={1.75} /> Let&apos;s get your books ready for {p.periodLabel}</div>
        <p className="text-[14px] text-muted mb-6">Three steps, and most of the work is done for you.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { n: 1, t: "Import your bank and card activity", d: "Download a CSV from your bank or card website and drop it in. The AI categorizes every line.", b: "Import CSV", go: p.onImport },
            { n: 2, t: "Add receipts", d: "Drop in PDF receipts and invoices. The AI reads the vendor, date and amount. Keep receipts for expenses of $75 or more.", b: "Add a receipt", go: p.onReceipt },
            { n: 3, t: "Review and send", d: "Approve the suggestions, then download the accountant package: an Excel workbook and all receipts.", b: null, go: null },
          ].map((x) => (
            <div key={x.n} className="bg-white rounded-xl border border-line p-5 flex flex-col">
              <div className="w-7 h-7 rounded-full bg-card-alt border border-line flex items-center justify-center text-[13px] font-semibold mb-3">{x.n}</div>
              <div className="text-[14.5px] font-semibold">{x.t}</div>
              <div className="text-[13px] text-muted mt-1 flex-1">{x.d}</div>
              {x.b && x.go && <button onClick={x.go} className={`${blackBtn} mt-4 self-start`}>{x.b}</button>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  const { s, r } = p;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Income" value={money(s.income)} sub="Fees and other income, excluding trust" />
        <Stat label="Expenses" value={money(s.expenses)} sub={`Est. deductible ${money(s.deductible)}`} />
        <Stat label="Net profit" value={money(s.net)} sub={p.periodLabel} />
        <Stat label="Billable time recorded" value={money(p.timeValue)} sub="From Time Tracking, at your rates" />
      </div>
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="bg-card-alt rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-semibold">Accountant-ready</div>
            <div className="text-[26px] font-semibold tabular-nums">{r.score}%</div>
          </div>
          <div className="h-2.5 rounded-full bg-white overflow-hidden mb-5">
            <div className="h-full rounded-full bg-[#00D178] transition-all" style={{ width: `${r.score}%` }} />
          </div>
          <div className="grid gap-3">
            {r.checks.map((c) => {
              const done = c.total === 0 || c.done === c.total;
              return (
                <div key={c.key} className="flex items-start gap-2.5">
                  {done ? <CircleCheck size={17} strokeWidth={1.75} className="text-green-700 mt-0.5" /> : <Circle size={17} strokeWidth={1.75} className="text-muted mt-0.5" />}
                  <div className="flex-1">
                    <div className="text-[13.5px] font-medium">{c.label}</div>
                    <div className="text-[12.5px] text-muted">{c.total === 0 ? "Nothing to do" : done ? `All ${c.total} done` : `${c.done} of ${c.total} done. ${c.tip}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {p.reviewCount > 0 && (
            <button onClick={p.onReview} className={`${blackBtn} mt-5`}>
              <Sparkles size={14} strokeWidth={2} /> Review {p.reviewCount} AI suggestion{p.reviewCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
        <div className="bg-card-alt rounded-2xl p-6">
          <div className="text-[15px] font-semibold mb-3">Questions for your accountant</div>
          {r.questions.length ? (
            <ul className="grid gap-2.5">
              {r.questions.map((q, i) => (
                <li key={i} className="text-[13.5px] bg-white border border-line rounded-xl px-3.5 py-2.5">{q}</li>
              ))}
            </ul>
          ) : (
            <div className="text-[13.5px] text-muted">Nothing unusual found. These go into the package automatically.</div>
          )}
          <div className="text-[12.5px] text-muted mt-4">
            Trust (IOLTA): {money(s.trustIn)} in, {money(s.trustOut)} out. Listed separately and not counted as income.
          </div>
        </div>
      </div>
      <div className="bg-card-alt rounded-2xl p-6">
        <div className="text-[15px] font-semibold mb-3">Top expense categories</div>
        <CategoryBars rows={s.byCategory.filter((c) => c.pl === "expense").slice(0, 8)} />
      </div>
    </div>
  );
}

function CategoryBars({ rows }: { rows: { key: string; label: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <div className="text-[13.5px] text-muted">No expenses yet.</div>;
  return (
    <div className="grid gap-2.5">
      {rows.map((c) => (
        <div key={c.key} className="grid grid-cols-[200px_1fr_110px] items-center gap-3 text-[13.5px]">
          <span className="truncate">{c.label}</span>
          <div className="h-2 rounded-full bg-white overflow-hidden"><div className="h-full rounded-full bg-muted-light" style={{ width: `${(c.total / max) * 100}%` }} /></div>
          <span className="text-right tabular-nums">{money(c.total)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Review ──
function Confidence({ v }: { v: number | null }) {
  if (v === null) return null;
  const pct = Math.round(v * 100);
  const cls = v >= 0.85 ? "bg-[#CAF0D9]" : v >= 0.6 ? "bg-[#F9E1C0]" : "bg-[#F9B2B3]";
  return <span className={`text-[11.5px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{pct}% sure</span>;
}

function ReviewList(p: {
  items: Txn[]; clientName: (id: string | null) => string;
  onApprove: (t: Txn) => void; onExclude: (t: Txn) => void; onCategory: (t: Txn, c: string) => void; onOpen: (t: Txn) => void; onApproveConfident: () => void;
}) {
  const confident = p.items.filter((t) => t.category !== "uncategorized" && (t.aiConfidence ?? 0) >= 0.85).length;
  if (!p.items.length) {
    return (
      <div className="bg-card-alt rounded-2xl py-14 text-center">
        <CircleCheck size={24} strokeWidth={1.5} className="mx-auto mb-2 text-green-700" />
        <div className="text-[15px] font-medium">All caught up</div>
        <div className="text-[13px] text-muted mt-1">Everything in this period has been reviewed.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[13.5px] text-muted">The AI suggested a category for each line. Approve, change the category, or exclude anything that isn&apos;t business.</div>
        {confident > 0 && (
          <button onClick={p.onApproveConfident} className={blackBtn}>
            <Check size={14} strokeWidth={2} /> Approve {confident} confident suggestion{confident === 1 ? "" : "s"}
          </button>
        )}
      </div>
      <div className="bg-card-alt rounded-2xl p-2">
        <div className="bg-cream rounded-xl divide-y divide-line">
          {p.items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <div className="w-[88px] text-[12.5px] text-muted tabular-nums">{t.date}</div>
              <button onClick={() => p.onOpen(t)} className="flex-1 min-w-[220px] text-left">
                <div className="text-[14px] font-medium truncate">{t.counterparty || t.description || "No description"}</div>
                <div className="text-[12px] text-muted truncate">
                  {t.counterparty ? t.description : ""} {t.aiReason ? `· ${t.aiReason}` : ""}
                </div>
              </button>
              <Confidence v={t.aiConfidence} />
              <div className="w-[220px]">
                <SelectBox label="Category" value={t.category} onChange={(c) => p.onCategory(t, c)}>
                  {(t.kind === "transfer" ? CATEGORIES : categoriesFor(t.kind).concat(CATEGORIES.filter((c) => c.kind === "transfer"))).map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </SelectBox>
              </div>
              <div className={`w-[110px] text-right text-[14px] font-medium tabular-nums ${t.kind === "income" ? "text-green-700" : ""}`}>
                {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount)}
              </div>
              <button onClick={() => p.onApprove(t)} disabled={t.category === "uncategorized"} title={t.category === "uncategorized" ? "Pick a category first" : "Approve"} className="bg-btn hover:bg-btn-hover px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-40">
                Approve
              </button>
              <button onClick={() => p.onExclude(t)} title="Not a business transaction" className="text-[12.5px] text-muted hover:text-ink px-1">
                Exclude
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Transactions ──
function TxnTable(p: { txns: Txn[]; clientName: (id: string | null) => string; matterName: (id: string | null) => string; onOpen: (t: Txn) => void; onCategory: (t: Txn, c: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = p.txns.filter((t) => {
    if (filter === "income" && plOf(t) !== "income") return false;
    if (filter === "expense" && plOf(t) !== "expense") return false;
    if (filter === "trust" && t.account !== "trust") return false;
    if (filter === "no_receipt" && !(t.kind === "expense" && t.amount >= 75 && !t.receiptPath && plOf(t) === "expense")) return false;
    if (filter === "excluded" && t.status !== "excluded") return false;
    if (filter !== "excluded" && t.status === "excluded" && filter !== "all") return false;
    const hay = `${t.description} ${t.counterparty} ${catLabel(t.category)} ${t.notes} ${t.clientId ? p.clientName(t.clientId) : ""} ${t.matterId ? p.matterName(t.matterId) : ""} ${t.amount}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[380px]">
          <Search size={15} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, client, category, amount" className="w-full border border-line bg-white rounded-full pl-10 pr-4 py-2 text-[13.5px] outline-none focus:border-ink" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[["all", "All"], ["income", "Income"], ["expense", "Expenses"], ["no_receipt", "Missing receipt"], ["trust", "Trust"], ["excluded", "Excluded"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-[13px] font-medium ${filter === k ? "bg-btn" : "bg-chip hover:bg-btn"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="bg-card-alt rounded-2xl p-2 overflow-x-auto">
        <div className="bg-cream rounded-xl min-w-[860px]">
          <div className="grid grid-cols-[90px_1fr_210px_140px_110px_28px] gap-3 px-4 py-2.5 text-[12px] font-medium text-muted border-b border-line">
            <span>Date</span><span>Payee / description</span><span>Category</span><span>Account</span><span className="text-right">Amount</span><span />
          </div>
          {shown.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13.5px] text-muted">No transactions match.</div>
          ) : (
            shown.map((t) => (
              <div key={t.id} className={`grid grid-cols-[90px_1fr_210px_140px_110px_28px] gap-3 px-4 py-2.5 items-center border-b border-line last:border-0 ${t.status === "excluded" ? "opacity-50" : ""}`}>
                <span className="text-[12.5px] text-muted tabular-nums">{t.date}</span>
                <button onClick={() => p.onOpen(t)} className="text-left min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{t.counterparty || t.description || "No description"}</div>
                  <div className="text-[12px] text-muted truncate">
                    {[t.counterparty ? t.description : "", t.clientId ? p.clientName(t.clientId) : "", t.matterId ? p.matterName(t.matterId) : "", t.status === "needs_review" ? "Not reviewed" : ""].filter(Boolean).join(" · ")}
                  </div>
                </button>
                <SelectBox label="Category" value={t.category} onChange={(c) => p.onCategory(t, c)}>
                  {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </SelectBox>
                <span className="text-[12.5px] text-muted truncate">{ACCOUNT_LABEL[t.account]}</span>
                <span className={`text-right text-[13.5px] font-medium tabular-nums ${t.kind === "income" ? "text-green-700" : ""}`}>
                  {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount)}
                </span>
                <span title={t.receiptPath ? "Receipt attached" : ""}>{t.receiptPath && <Paperclip size={14} strokeWidth={1.75} className="text-muted" />}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reports ──
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-card-alt rounded-2xl p-6"><div className="text-[15px] font-semibold mb-3">{title}</div>{children}</div>;
}
function Row({ a, b, c, bold }: { a: string; b?: string; c: string; bold?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_260px_120px] gap-3 py-2 border-b border-line last:border-0 text-[13.5px] ${bold ? "font-semibold" : ""}`}>
      <span>{a}</span><span className="hidden sm:block text-[12.5px] text-muted">{b}</span><span className="text-right tabular-nums">{c}</span>
    </div>
  );
}

function Reports({ s, time, clientName, matterName }: { s: ReturnType<typeof summarize>; time: TimeRow[]; clientName: (id: string | null) => string; matterName: (id: string | null) => string }) {
  const inc = s.byCategory.filter((c) => c.pl === "income");
  const exp = s.byCategory.filter((c) => c.pl === "expense");
  return (
    <div className="grid gap-5">
      <Box title="Profit & Loss">
        {inc.map((c) => <Row key={c.key} a={c.label} b={c.schedC} c={money(c.total)} />)}
        <Row a="Total income" c={money(s.income)} bold />
        <div className="h-3" />
        {exp.map((c) => <Row key={c.key} a={c.label} b={c.schedC} c={money(c.total)} />)}
        <Row a="Total expenses" c={money(s.expenses)} bold />
        <div className="h-3" />
        <Row a="Net profit" c={money(s.net)} bold />
      </Box>
      <div className="grid lg:grid-cols-2 gap-5">
        <Box title="By month">
          {s.byMonth.length ? s.byMonth.map((m) => <Row key={m.month} a={m.month} b={`In ${money(m.income)} · Out ${money(m.expenses)}`} c={money(m.income - m.expenses)} />) : <div className="text-[13.5px] text-muted">No activity.</div>}
        </Box>
        <Box title="Income by client">
          {s.incomeByClient.length ? s.incomeByClient.map((c) => <Row key={c.clientId ?? "none"} a={c.clientId ? clientName(c.clientId) : "No client linked"} c={money(c.total)} />) : <div className="text-[13.5px] text-muted">No fee income yet.</div>}
        </Box>
        <Box title="Client costs advanced">
          {s.clientCosts.length ? s.clientCosts.map((c, i) => <Row key={i} a={c.matterId ? matterName(c.matterId) : c.clientId ? clientName(c.clientId) : "Not linked to a matter"} b={`Reimbursable ${money(c.reimbursable)}`} c={money(c.total)} />) : <div className="text-[13.5px] text-muted">No client costs.</div>}
        </Box>
        <Box title="Billable time recorded">
          {time.length ? time.map((t) => <Row key={t.matterId ?? "none"} a={t.matterId ? matterName(t.matterId) : "No matter"} b={`${(t.billableMinutes / 60).toFixed(1)} billable h · ${(t.otherMinutes / 60).toFixed(1)} other h`} c={money(t.valueCents / 100)} />) : <div className="text-[13.5px] text-muted">No time recorded in this period.</div>}
        </Box>
      </div>
    </div>
  );
}
