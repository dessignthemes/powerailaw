"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Printer, Info } from "lucide-react";
import type { PracticeReport } from "@/lib/reports/practice";

// ── Periods ─────────────────────────────────────────────────────────────────

type PeriodKey = "month" | "quarter" | "year" | "12m" | "all";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function rangeFor(key: PeriodKey): { from: string | null; to: string | null } {
  const now = new Date();
  const to = iso(now);
  if (key === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (key === "quarter") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
  if (key === "year") return { from: `${now.getFullYear()}-01-01`, to };
  if (key === "12m") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to };
  return { from: null, to: null };
}

// ── Look ────────────────────────────────────────────────────────────────────

// One colour per practice area, the same in every chart.
const AREA_COLORS: Record<string, string> = {
  "Real Estate": "#3F5F8F",
  Probate: "#8A6A3B",
  "Estate Planning": "#5E8C6A",
  Immigration: "#7A5C99",
  Litigation: "#A04B4B",
  "Family Law": "#C27C5B",
  "Personal Injury": "#3E8A8A",
  "Criminal Defense": "#5A5A5A",
  "Business / Corporate": "#6F7FA6",
  "Other / not set": "#AEB8C6",
};
const colorOf = (c: string) => AREA_COLORS[c] ?? "#8A94A6";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
const monthLabel = (ym: string, withYear = false) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", ...(withYear ? { year: "2-digit" } : {}) });
};

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-card-alt rounded-2xl p-5 break-inside-avoid ${className}`}>
      <h3 className="text-[14.5px] font-semibold">{title}</h3>
      {sub && <p className="text-[12.5px] text-muted mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-card-alt rounded-2xl px-5 py-4">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="text-[26px] font-semibold mt-1 tabular-nums">{value}</div>
      {note && <div className="text-[12px] text-muted mt-0.5">{note}</div>}
    </div>
  );
}

// Ring chart with the total in the middle.
function Donut({ parts, total, label }: { parts: { name: string; value: number }[]; total: number; label: string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 180 180" className="w-[180px] h-[180px] flex-shrink-0" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
      <circle cx="90" cy="90" r={r} fill="none" stroke="#E1E5EC" strokeWidth="22" />
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.name}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={colorOf(p.name)}
                strokeWidth="22"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              >
                <title>{`${p.name}: ${p.value} (${pct(p.value, total)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      <text x="90" y="86" textAnchor="middle" className="fill-current" style={{ fontSize: 30, fontWeight: 600 }}>
        {total}
      </text>
      <text x="90" y="108" textAnchor="middle" style={{ fontSize: 12, fill: "#6B7280" }}>
        {label}
      </text>
    </svg>
  );
}

function Legend({ rows, total }: { rows: { name: string; value: number }[]; total: number }) {
  return (
    <div className="flex-1 min-w-[200px] flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-[13px]">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colorOf(r.name) }} />
          <span className="flex-1 truncate">{r.name}</span>
          <span className="tabular-nums font-medium">{r.value}</span>
          <span className="tabular-nums text-muted w-10 text-right">{pct(r.value, total)}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars, one per row.
function Bars({ rows, format = (n: number) => String(n), colorBy = true }: { rows: { name: string; value: number }[]; format?: (n: number) => string; colorBy?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate" title={r.name}>
            {r.name}
          </span>
          <div className="h-3.5 rounded-full bg-[#E1E5EC] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: colorBy ? colorOf(r.name) : "#5E6E8C" }} />
          </div>
          <span className="tabular-nums font-medium min-w-[44px] text-right">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Monthly columns, stacked by practice area.
function MonthColumns({ months, areas }: { months: PracticeReport["intakeByMonth"]; areas: string[] }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  const yearChanges = new Set(months.filter((m, i) => i === 0 || m.month.slice(0, 4) !== months[i - 1].month.slice(0, 4)).map((m) => m.month));
  return (
    <div>
      <div className="flex items-end gap-1.5 h-[170px] border-b border-line pb-px">
        {months.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={`${monthLabel(m.month, true)}: ${m.count} new`}>
            {m.count > 0 && <span className="text-[11px] tabular-nums text-muted">{m.count}</span>}
            <div className="w-full max-w-[34px] flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: `${(m.count / max) * 130}px` }}>
              {areas
                .filter((a) => m.byCategory[a])
                .map((a) => (
                  <div key={a} style={{ height: `${(m.byCategory[a] / m.count) * 100}%`, backgroundColor: colorOf(a) }} />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {months.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 text-center text-[11px] text-muted truncate">
            {monthLabel(m.month, yearChanges.has(m.month))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Income and expenses side by side per month.
function MoneyColumns({ months }: { months: PracticeReport["finance"]["byMonth"] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  return (
    <div>
      <div className="flex items-end gap-2 h-[170px] border-b border-line pb-px">
        {months.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 h-full flex items-end justify-center gap-[3px]" title={`${monthLabel(m.month, true)}: income ${money(m.income)}, expenses ${money(m.expenses)}`}>
            <div className="w-[45%] max-w-[16px] rounded-t-sm bg-[#3F7A5A]" style={{ height: `${(m.income / max) * 160}px` }} />
            <div className="w-[45%] max-w-[16px] rounded-t-sm bg-[#C9855C]" style={{ height: `${(m.expenses / max) * 160}px` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {months.map((m, i) => (
          <div key={m.month} className="flex-1 min-w-0 text-center text-[11px] text-muted truncate">
            {monthLabel(m.month, i === 0 || m.month.endsWith("-01"))}
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-[12.5px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#3F7A5A]" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#C9855C]" /> Expenses
        </span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-[13px] text-muted py-6 text-center">{text}</div>;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("year");
  const [data, setData] = useState<{ key: string; report: PracticeReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => rangeFor(period), [period]);
  const key = `${range.from}|${range.to}`;

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ today: iso(new Date()) });
    if (range.from) qs.set("from", range.from);
    if (range.to) qs.set("to", range.to);
    fetch(`/api/reports?${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "The report couldn't be loaded. Please try again.");
        return d as PracticeReport;
      })
      .then((report) => {
        if (!live) return;
        setData({ key, report });
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [key, range.from, range.to]);

  const r = data?.key === key ? data.report : null;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  const areas = r ? r.categories.map((c) => c.category) : [];
  const mix = r ? r.categories.filter((c) => c.current > 0).map((c) => ({ name: c.category, value: c.current })).sort((a, b) => b.value - a.value) : [];
  const newMix = r ? r.categories.filter((c) => c.newInPeriod > 0).map((c) => ({ name: c.category, value: c.newInPeriod })).sort((a, b) => b.value - a.value) : [];
  const incomeByArea = r ? r.categories.filter((c) => c.income > 0).map((c) => ({ name: c.category, value: c.income })).sort((a, b) => b.value - a.value) : [];

  return (
    <div className="px-10 py-10 max-w-[1400px] print:px-0 print:py-0">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[28px] font-semibold flex items-center gap-2.5">Reports</h1>
          <p className="text-[14.5px] text-muted mt-1">Practice overview: matters by practice area, intake, and the firm&apos;s finances.</p>
        </div>
        <button onClick={() => window.print()} className="print:hidden bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5">
          <Printer size={14} /> Print or save as PDF
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-8 print:hidden" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={period === p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${period === p.key ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="hidden print:block text-[13px] text-muted mb-4">Period: {PERIODS.find((p) => p.key === period)!.label}</div>

      {error ? (
        <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>
      ) : !r ? (
        <div className="text-[13.5px] text-muted flex items-center gap-2 py-10">
          <Loader2 size={15} className="animate-spin" /> Putting the report together…
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* ── Matters ── */}
          <div>
            <h2 className="text-[18px] font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={17} className="text-muted" /> Matters
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Stat label="Current matters" value={r.totals.current.toLocaleString()} note="Everything not closed" />
              <Stat label={`New matters, ${periodLabel}`} value={r.totals.newInPeriod.toLocaleString()} note="Opened in LawPower" />
              <Stat label="Closed matters" value={r.totals.closed.toLocaleString()} note="All time" />
              <Stat label="All matters" value={r.totals.matters.toLocaleString()} note={r.totals.imported ? `${r.totals.imported.toLocaleString()} imported from LEAP` : undefined} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card title="Practice mix: current matters" sub="How much of the practice is each area right now">
                {mix.length ? (
                  <div className="flex items-center gap-6 flex-wrap">
                    <Donut parts={mix} total={r.totals.current} label="current" />
                    <Legend rows={mix} total={r.totals.current} />
                  </div>
                ) : (
                  <Empty text="No current matters." />
                )}
              </Card>
              <Card title={`New matters by practice area, ${periodLabel}`} sub="Matters opened in LawPower in this period">
                {newMix.length ? <Bars rows={newMix} /> : <Empty text="No new matters in this period." />}
              </Card>
              <Card title="Intake: new matters by month" sub={period === "all" ? "Last 12 months, coloured by practice area" : "Coloured by practice area"} className="xl:col-span-2">
                <MonthColumns months={r.intakeByMonth} areas={areas} />
                <div className="flex gap-x-4 gap-y-1.5 flex-wrap mt-4">
                  {areas.map((a) => (
                    <span key={a} className="flex items-center gap-1.5 text-[12px]">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colorOf(a) }} /> {a}
                    </span>
                  ))}
                </div>
              </Card>
              <Card title="Matters by status" sub="All matters, whatever the period">
                <Bars rows={r.statuses.map((s) => ({ name: s.status, value: s.count }))} colorBy={false} />
              </Card>
              <Card title="Matters opened by year" sub="From the year in the matter number (e.g. REP-2026-3707), so imported matters count too">
                <Bars rows={r.byYear.map((y) => ({ name: y.year, value: y.count })).reverse()} colorBy={false} />
              </Card>
            </div>
          </div>

          {/* ── Finances ── */}
          <div>
            <h2 className="text-[18px] font-semibold mb-4">Finances</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Stat label={`Income, ${periodLabel}`} value={money(r.finance.income)} note="From AI Accountant · trust money not included" />
              <Stat label={`Expenses, ${periodLabel}`} value={money(r.finance.expenses)} note="From AI Accountant" />
              <Stat label="Net" value={money(r.finance.net)} note="Income minus expenses" />
              <Stat label={`Billable time, ${periodLabel}`} value={`${r.finance.billableHours.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`} note={`${money(r.finance.billableValue)} at hourly rates`} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card title="Income and expenses by month" sub={period === "all" ? "Last 12 months" : undefined} className="xl:col-span-2">
                {r.finance.hasBooks ? <MoneyColumns months={r.finance.byMonth} /> : <Empty text="No transactions in AI Accountant for this period yet." />}
              </Card>
              <Card title="Income by practice area" sub="Only income that's linked to a matter in AI Accountant">
                {incomeByArea.length ? <Bars rows={incomeByArea} format={money} /> : <Empty text="No income linked to matters in this period." />}
              </Card>
              <Card title="Practice areas side by side" sub="Matter value = flat fees and matter values entered on current matters">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-muted text-[12px]">
                        <th className="font-medium py-1.5 pr-3">Area</th>
                        <th className="font-medium py-1.5 px-2 text-right">Current</th>
                        <th className="font-medium py-1.5 px-2 text-right">New</th>
                        <th className="font-medium py-1.5 px-2 text-right">Matter value</th>
                        <th className="font-medium py-1.5 px-2 text-right">Hours</th>
                        <th className="font-medium py-1.5 pl-2 text-right">Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.categories.map((c) => (
                        <tr key={c.category} className="border-t border-line">
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colorOf(c.category) }} />
                              {c.category}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.current}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.newInPeriod}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.currentValue ? money(c.currentValue) : "—"}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{c.billableHours ? c.billableHours.toFixed(1) : "—"}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">{c.income ? money(c.income) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>

          {r.totals.imported > 0 && (
            <p className="text-[12.5px] text-muted flex gap-2 items-start">
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              The {r.totals.imported.toLocaleString()} matters imported from LEAP count as current or closed matters and in the practice mix. Their opening dates weren&apos;t in the import, so
              they aren&apos;t in the monthly intake; &ldquo;Matters opened by year&rdquo; counts them by the year in their matter number.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
