import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Practice overview for Reports: matters (intake, current, practice mix) and
// finances (AI Accountant income/expenses, billable time, matter values).
// Everything is for one firm; trust money and transfers are never counted as income.

export type Period = { from: string | null; to: string | null }; // YYYY-MM-DD, null = open-ended

type MatterRow = {
  id: string;
  category: string | null;
  status: string;
  created_at: string;
  value: number | null;
  billing_type: string | null;
  hourly_rate: number | null;
  matter_number: string | null;
  description: string | null;
};

export const OTHER = "Other / not set";
const catOf = (c: string | null) => (c && c !== "None" ? c : OTHER);
const isImported = (m: MatterRow) => /^Imported\b/m.test(m.description ?? "");
const ymd = (iso: string) => iso.slice(0, 10);
const inPeriod = (date: string, p: Period) => (!p.from || date >= p.from) && (!p.to || date <= p.to);
const monthOf = (date: string) => date.slice(0, 7);

// All months between two dates (YYYY-MM), so empty months still show as 0.
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 60) break;
  }
  return out;
}

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await q(page * 1000, page * 1000 + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// "REP-2026-3707" → { prefix: "REP", year: "2026" }.
export function numberParts(n: string | null | undefined): { prefix: string; year: string } | null {
  const m = (n ?? "").toUpperCase().match(/^([A-Z][A-Z0-9]{0,7})-(\d{4})-\d+$/);
  return m ? { prefix: m[1], year: m[2] } : null;
}
// Filter by the matter number: its prefix (REP, RES, EP…) and/or its year.
export type NumberFilter = { prefixes: string[]; year: string | null };
// ?prefix=REP,RES&year=2026 — only matters with those prefixes / that year in their number.
export function numberFilter(u: URLSearchParams): NumberFilter {
  const prefixes = (u.get("prefix") ?? "").toUpperCase().split(",").map((x) => x.trim()).filter((x) => /^[A-Z][A-Z0-9]{0,7}$/.test(x)).slice(0, 20);
  const year = u.get("year");
  return { prefixes, year: year && /^\d{4}$/.test(year) ? year : null };
}


export async function practiceReport(orgId: string, period: Period, today: string, filter: NumberFilter = { prefixes: [], year: null }) {
  const db = createAdminClient();
  const everyMatter = await all<MatterRow>((a, b) =>
    db.from("matters").select("id, category, status, created_at, value, billing_type, hourly_rate, matter_number, description").eq("org_id", orgId).range(a, b)
  );
  // The prefixes and years there are (for the filter lists), with how many matters each.
  const prefixCount = new Map<string, number>();
  const numberYears = new Map<string, number>();
  for (const m of everyMatter) {
    const p = numberParts(m.matter_number);
    if (!p) continue;
    prefixCount.set(p.prefix, (prefixCount.get(p.prefix) ?? 0) + 1);
    numberYears.set(p.year, (numberYears.get(p.year) ?? 0) + 1);
  }
  const filtering = filter.prefixes.length > 0 || !!filter.year;
  const matters = !filtering
    ? everyMatter
    : everyMatter.filter((m) => {
        const p = numberParts(m.matter_number);
        return !!p && (!filter.prefixes.length || filter.prefixes.includes(p.prefix)) && (!filter.year || p.year === filter.year);
      });
  const byId = new Map(matters.map((m) => [m.id, m]));

  // Time (billable only) and the books (optional: missing tables just mean no data yet).
  const time = await all<{ entry_date: string; minutes: number; billable: boolean; rate_cents: number | null; matter_id: string | null }>((a, b) => {
    let q = db.from("time_entries").select("entry_date, minutes, billable, rate_cents, matter_id").eq("org_id", orgId);
    if (period.from) q = q.gte("entry_date", period.from);
    if (period.to) q = q.lte("entry_date", period.to);
    return q.range(a, b);
  }).catch(() => []);
  const books = await all<{ kind: string; txn_date: string; amount: number; account: string; status: string; matter_id: string | null }>((a, b) => {
    let q = db.from("acct_transactions").select("kind, txn_date, amount, account, status, matter_id").eq("org_id", orgId).neq("status", "excluded");
    if (period.from) q = q.gte("txn_date", period.from);
    if (period.to) q = q.lte("txn_date", period.to);
    return q.range(a, b);
  }).catch(() => []);

  type Cat = {
    category: string;
    current: number;
    newInPeriod: number;
    closed: number;
    total: number;
    currentValue: number;
    billableHours: number;
    billableValue: number;
    income: number;
    expenses: number;
  };
  const cats = new Map<string, Cat>();
  const cat = (name: string) => {
    let c = cats.get(name);
    if (!c) {
      c = { category: name, current: 0, newInPeriod: 0, closed: 0, total: 0, currentValue: 0, billableHours: 0, billableValue: 0, income: 0, expenses: 0 };
      cats.set(name, c);
    }
    return c;
  };

  const statusCount = new Map<string, number>();
  const yearCount = new Map<string, number>();
  let imported = 0;
  let newInPeriod = 0;
  const intake = new Map<string, Map<string, number>>(); // month → category → count

  for (const m of matters) {
    const c = cat(catOf(m.category));
    c.total++;
    statusCount.set(m.status, (statusCount.get(m.status) ?? 0) + 1);
    if (m.status === "Closed") c.closed++;
    else {
      c.current++;
      c.currentValue += Number(m.value ?? 0) || 0;
    }
    // Year opened: the year in the matter number (REP-2026-3707), else the year it was added.
    const year = m.matter_number?.match(/-(\d{4})-\d+$/)?.[1] ?? m.created_at.slice(0, 4);
    yearCount.set(year, (yearCount.get(year) ?? 0) + 1);
    if (isImported(m)) {
      imported++;
      continue; // opening date unknown: not in the monthly intake
    }
    const d = ymd(m.created_at);
    if (inPeriod(d, period)) {
      c.newInPeriod++;
      newInPeriod++;
      const mo = monthOf(d);
      const row = intake.get(mo) ?? new Map<string, number>();
      row.set(c.category, (row.get(c.category) ?? 0) + 1);
      intake.set(mo, row);
    }
  }

  // Billable time by practice area. Flat-fee matters show hours but no hourly value.
  let billableMinutes = 0;
  let billableValue = 0;
  for (const t of time) {
    if (!t.billable) continue;
    if (filtering && !(t.matter_id && byId.has(t.matter_id))) continue;
    const m = t.matter_id ? byId.get(t.matter_id) : undefined;
    const c = cat(catOf(m?.category ?? null));
    const flat = m?.billing_type === "Flat fee";
    const rate = flat ? 0 : t.rate_cents != null ? t.rate_cents / 100 : Number(m?.hourly_rate ?? 0) || 0;
    const value = (t.minutes / 60) * rate;
    c.billableHours += t.minutes / 60;
    c.billableValue += value;
    billableMinutes += t.minutes;
    billableValue += value;
  }

  // Books: operating money only (trust is clients' money; transfers aren't income).
  const money = new Map<string, { income: number; expenses: number }>();
  let income = 0;
  let expenses = 0;
  for (const t of books) {
    if (t.account === "trust" || t.kind === "transfer") continue;
    if (filtering && !(t.matter_id && byId.has(t.matter_id))) continue; // filtered: only money linked to those matters
    const amt = Number(t.amount) || 0;
    const mo = monthOf(t.txn_date);
    const row = money.get(mo) ?? { income: 0, expenses: 0 };
    const m = t.matter_id ? byId.get(t.matter_id) : undefined;
    if (t.kind === "income") {
      row.income += amt;
      income += amt;
      if (m) cat(catOf(m.category)).income += amt;
    } else {
      row.expenses += amt;
      expenses += amt;
      if (m) cat(catOf(m.category)).expenses += amt;
    }
    money.set(mo, row);
  }

  // Month range for the charts: the period, or the last 12 months for "all time".
  const end = period.to ?? today;
  const [ey, em] = end.split("-").map(Number);
  const twelveBack = `${em === 12 ? ey : ey - 1}-${String((em % 12) + 1).padStart(2, "0")}-01`;
  const months = monthsBetween(period.from ?? twelveBack, end);

  const categories = [...cats.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
  return {
    period,
    filter,
    prefixes: [...prefixCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([prefix, count]) => ({ prefix, count })),
    numberYears: [...numberYears.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, count]) => ({ year, count })),
    totals: {
      matters: matters.length,
      current: matters.filter((m) => m.status !== "Closed").length,
      closed: matters.filter((m) => m.status === "Closed").length,
      newInPeriod,
      imported,
    },
    categories,
    statuses: ["Lead", "Consultation", "Engaged", "Active", "Closed"].map((s) => ({ status: s, count: statusCount.get(s) ?? 0 })),
    byYear: [...yearCount.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, count]) => ({ year, count })),
    intakeByMonth: months.map((mo) => ({ month: mo, byCategory: Object.fromEntries(intake.get(mo) ?? []), count: [...(intake.get(mo)?.values() ?? [])].reduce((a, b) => a + b, 0) })),
    finance: {
      income,
      expenses,
      net: income - expenses,
      billableHours: billableMinutes / 60,
      billableValue,
      currentMatterValue: categories.reduce((n, c) => n + c.currentValue, 0),
      byMonth: months.map((mo) => ({ month: mo, ...(money.get(mo) ?? { income: 0, expenses: 0 }) })),
      hasBooks: books.length > 0,
      hasTime: time.length > 0,
    },
  };
}

export type PracticeReport = Awaited<ReturnType<typeof practiceReport>>;
