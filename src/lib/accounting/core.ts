// AI Accountant: categories, money maths, readiness and bank-file parsing.
// Shared by the server and the page, so both agree on every number.

export type Kind = "income" | "expense" | "transfer";
export type Account = "operating" | "trust" | "credit_card" | "other";
export type Status = "needs_review" | "ready" | "excluded";

export type Txn = {
  id: string;
  kind: Kind;
  date: string; // YYYY-MM-DD
  description: string;
  counterparty: string;
  amount: number; // always positive; kind says which way
  category: string;
  account: Account;
  paymentMethod: string;
  clientId: string | null;
  matterId: string | null;
  reimbursable: boolean;
  notes: string;
  status: Status;
  source: "manual" | "receipt" | "bank_import";
  receiptPath: string | null;
  receiptName: string | null;
  aiConfidence: number | null;
  aiReason: string;
  createdAt: string;
};

type Cat = { key: string; label: string; kind: Kind; schedC?: string; hint: string; pl: "income" | "expense" | "none"; deductiblePct?: number };

// Categories a small law firm's accountant expects. "schedC" is the closest
// IRS Schedule C line, which most accountants map to.
export const CATEGORIES: Cat[] = [
  { key: "legal_fees", label: "Legal fees", kind: "income", schedC: "Line 1 Gross receipts", hint: "Fees paid by clients into the operating account", pl: "income" },
  { key: "retainer_earned", label: "Retainer earned (from trust)", kind: "income", schedC: "Line 1 Gross receipts", hint: "Earned fees moved from trust to operating", pl: "income" },
  { key: "cost_reimbursement", label: "Client cost reimbursement", kind: "income", schedC: "Line 1 Gross receipts", hint: "Clients paying back costs you advanced", pl: "income" },
  { key: "interest_income", label: "Interest income", kind: "income", schedC: "Schedule B", hint: "Bank interest on the operating account", pl: "income" },
  { key: "other_income", label: "Other income", kind: "income", schedC: "Line 6 Other income", hint: "Speaking fees, referral fees, other", pl: "income" },

  { key: "advertising", label: "Advertising & marketing", kind: "expense", schedC: "Line 8 Advertising", hint: "Ads, website, SEO, directories", pl: "expense" },
  { key: "vehicle", label: "Car & mileage", kind: "expense", schedC: "Line 9 Car and truck", hint: "Fuel, parking, tolls, mileage", pl: "expense" },
  { key: "contract_labor", label: "Contract labor", kind: "expense", schedC: "Line 11 Contract labor", hint: "Freelance paralegals, contract attorneys", pl: "expense" },
  { key: "equipment", label: "Equipment & computers", kind: "expense", schedC: "Line 13 Depreciation", hint: "Laptops, printers, furniture", pl: "expense" },
  { key: "insurance_malpractice", label: "Malpractice insurance", kind: "expense", schedC: "Line 15 Insurance", hint: "Professional liability", pl: "expense" },
  { key: "insurance_other", label: "Other business insurance", kind: "expense", schedC: "Line 15 Insurance", hint: "Office, cyber, general liability", pl: "expense" },
  { key: "bank_fees", label: "Bank & card fees", kind: "expense", schedC: "Line 16b Interest / Line 27a", hint: "Monthly fees, card processing, interest", pl: "expense" },
  { key: "professional_fees", label: "Accounting & professional fees", kind: "expense", schedC: "Line 17 Legal and professional", hint: "Accountant, consultants", pl: "expense" },
  { key: "office_supplies", label: "Office supplies", kind: "expense", schedC: "Line 18 Office expense", hint: "Paper, toner, small items", pl: "expense" },
  { key: "postage", label: "Postage & courier", kind: "expense", schedC: "Line 18 Office expense", hint: "USPS, FedEx, UPS, messengers", pl: "expense" },
  { key: "rent", label: "Office rent", kind: "expense", schedC: "Line 20b Rent", hint: "Office or coworking", pl: "expense" },
  { key: "repairs", label: "Repairs & maintenance", kind: "expense", schedC: "Line 21 Repairs", hint: "Office repairs, IT support", pl: "expense" },
  { key: "taxes_licenses", label: "Taxes, licenses & bar dues", kind: "expense", schedC: "Line 23 Taxes and licenses", hint: "Bar dues, business licenses, registration", pl: "expense" },
  { key: "travel", label: "Travel", kind: "expense", schedC: "Line 24a Travel", hint: "Flights, hotels for work", pl: "expense" },
  { key: "meals", label: "Business meals (50%)", kind: "expense", schedC: "Line 24b Meals", hint: "Client or business meals; usually 50% deductible", pl: "expense", deductiblePct: 50 },
  { key: "utilities_phone", label: "Phone, internet & utilities", kind: "expense", schedC: "Line 25 Utilities", hint: "Mobile, internet, electricity", pl: "expense" },
  { key: "payroll", label: "Wages & benefits", kind: "expense", schedC: "Line 26 Wages / Line 14 Benefits", hint: "Staff payroll and benefits", pl: "expense" },
  { key: "legal_research", label: "Legal research", kind: "expense", schedC: "Line 27a Other expenses", hint: "Westlaw, Lexis, Fastcase, books", pl: "expense" },
  { key: "software", label: "Software & subscriptions", kind: "expense", schedC: "Line 27a Other expenses", hint: "Practice management, Microsoft, Google, Dropbox", pl: "expense" },
  { key: "cle", label: "CLE & training", kind: "expense", schedC: "Line 27a Other expenses", hint: "Continuing legal education, courses", pl: "expense" },
  { key: "client_costs", label: "Client costs advanced", kind: "expense", schedC: "Usually not deductible when reimbursable", hint: "Filing fees, experts, service of process paid for a client", pl: "expense" },
  { key: "other_expense", label: "Other expense", kind: "expense", schedC: "Line 27a Other expenses", hint: "Anything else for the business", pl: "expense" },

  { key: "owner_draw", label: "Owner draw / personal", kind: "transfer", hint: "Money taken out by the owner; not an expense", pl: "none" },
  { key: "owner_contribution", label: "Owner contribution", kind: "transfer", hint: "Owner putting money in; not income", pl: "none" },
  { key: "transfer", label: "Transfer between accounts", kind: "transfer", hint: "Moving money between your own accounts, card payments", pl: "none" },
  { key: "trust_activity", label: "Trust (IOLTA) activity", kind: "transfer", hint: "Client money held in trust; never income until earned", pl: "none" },
  { key: "uncategorized", label: "Uncategorized", kind: "expense", hint: "Needs a category", pl: "none" },
];

export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<string, Cat>;
export const catLabel = (key: string) => CAT[key]?.label ?? "Uncategorized";
export const categoriesFor = (kind: Kind) => CATEGORIES.filter((c) => c.kind === kind || c.key === "uncategorized");

export const ACCOUNT_LABEL: Record<Account, string> = {
  operating: "Operating account",
  trust: "Trust / IOLTA",
  credit_card: "Credit card",
  other: "Other",
};

// IRS guidance: keep receipts for expenses of $75 or more (lodging always).
export const RECEIPT_THRESHOLD = 75;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Counts toward the P&L only when it's approved-or-pending, outside trust,
// and in an income/expense category.
export function plOf(t: Txn): "income" | "expense" | "none" {
  if (t.status === "excluded" || t.account === "trust") return "none";
  return CAT[t.category]?.pl ?? "none";
}

export type Summary = {
  income: number;
  expenses: number;
  net: number;
  deductible: number;
  byCategory: { key: string; label: string; pl: "income" | "expense"; total: number; count: number; schedC: string }[];
  byMonth: { month: string; income: number; expenses: number }[];
  incomeByClient: { clientId: string | null; total: number }[];
  clientCosts: { matterId: string | null; clientId: string | null; total: number; reimbursable: number }[];
  trustIn: number;
  trustOut: number;
};

export function summarize(txns: Txn[]): Summary {
  const cats = new Map<string, Summary["byCategory"][number]>();
  const months = new Map<string, { income: number; expenses: number }>();
  const clients = new Map<string | null, number>();
  const costs = new Map<string, { matterId: string | null; clientId: string | null; total: number; reimbursable: number }>();
  let income = 0, expenses = 0, deductible = 0, trustIn = 0, trustOut = 0;
  for (const t of txns) {
    if (t.status === "excluded") continue;
    if (t.account === "trust") {
      if (t.kind === "income") trustIn += t.amount;
      else if (t.kind === "expense") trustOut += t.amount;
    }
    const pl = plOf(t);
    if (pl === "none") continue;
    const c = CAT[t.category];
    const row = cats.get(t.category) ?? { key: t.category, label: c.label, pl, total: 0, count: 0, schedC: c.schedC ?? "" };
    row.total += t.amount;
    row.count++;
    cats.set(t.category, row);
    const m = t.date.slice(0, 7);
    const mm = months.get(m) ?? { income: 0, expenses: 0 };
    if (pl === "income") {
      income += t.amount;
      mm.income += t.amount;
      clients.set(t.clientId, (clients.get(t.clientId) ?? 0) + t.amount);
    } else {
      expenses += t.amount;
      mm.expenses += t.amount;
      deductible += t.amount * ((c.deductiblePct ?? 100) / 100) * (t.category === "client_costs" && t.reimbursable ? 0 : 1);
    }
    months.set(m, mm);
    if (t.category === "client_costs") {
      const k = `${t.matterId ?? ""}|${t.clientId ?? ""}`;
      const cc = costs.get(k) ?? { matterId: t.matterId, clientId: t.clientId, total: 0, reimbursable: 0 };
      cc.total += t.amount;
      if (t.reimbursable) cc.reimbursable += t.amount;
      costs.set(k, cc);
    }
  }
  return {
    income: r2(income),
    expenses: r2(expenses),
    net: r2(income - expenses),
    deductible: r2(deductible),
    byCategory: [...cats.values()].map((c) => ({ ...c, total: r2(c.total) })).sort((a, b) => (a.pl === b.pl ? b.total - a.total : a.pl === "income" ? -1 : 1)),
    byMonth: [...months.entries()].sort().map(([month, v]) => ({ month, income: r2(v.income), expenses: r2(v.expenses) })),
    incomeByClient: [...clients.entries()].map(([clientId, total]) => ({ clientId, total: r2(total) })).sort((a, b) => b.total - a.total),
    clientCosts: [...costs.values()].map((c) => ({ ...c, total: r2(c.total), reimbursable: r2(c.reimbursable) })).sort((a, b) => b.total - a.total),
    trustIn: r2(trustIn),
    trustOut: r2(trustOut),
  };
}

// ── Readiness: how close the period is to "hand it to the accountant" ──

export type Check = { key: string; label: string; done: number; total: number; tip: string };

export function readiness(txns: Txn[]): { score: number; checks: Check[]; questions: string[] } {
  const live = txns.filter((t) => t.status !== "excluded");
  const reviewed = live.filter((t) => t.status === "ready").length;
  const categorized = live.filter((t) => t.category !== "uncategorized").length;
  const needReceipt = live.filter((t) => t.kind === "expense" && t.account !== "trust" && t.amount >= RECEIPT_THRESHOLD && plOf(t) === "expense");
  const withReceipt = needReceipt.filter((t) => t.receiptPath).length;
  const costs = live.filter((t) => t.category === "client_costs");
  const costsTagged = costs.filter((t) => t.matterId || t.clientId).length;
  const incomes = live.filter((t) => plOf(t) === "income" && ["legal_fees", "retainer_earned", "cost_reimbursement"].includes(t.category));
  const incomeTagged = incomes.filter((t) => t.clientId || t.matterId).length;

  const checks: Check[] = [
    { key: "categorized", label: "Every transaction has a category", done: categorized, total: live.length, tip: "Pick a category for each Uncategorized line." },
    { key: "reviewed", label: "Every transaction is reviewed", done: reviewed, total: live.length, tip: "Approve the AI's suggestions in Review." },
    { key: "receipts", label: `Receipts attached for expenses of ${money(RECEIPT_THRESHOLD)} or more`, done: withReceipt, total: needReceipt.length, tip: "Attach the receipt or invoice to each larger expense." },
    { key: "costs", label: "Client costs linked to a client or matter", done: costsTagged, total: costs.length, tip: "Link each advanced cost so it can be billed back." },
    { key: "income", label: "Fee income linked to a client", done: incomeTagged, total: incomes.length, tip: "Link each fee payment to the client who paid it." },
  ];
  // Weighted: categories and review matter most.
  const weights: Record<string, number> = { categorized: 35, reviewed: 30, receipts: 15, costs: 10, income: 10 };
  let score = 0;
  for (const c of checks) score += weights[c.key] * (c.total === 0 ? 1 : c.done / c.total);
  if (live.length === 0) score = 0;

  const questions: string[] = [];
  const draws = live.filter((t) => t.category === "owner_draw");
  if (draws.length) questions.push(`${draws.length} owner draw/personal item(s) totaling ${money(draws.reduce((a, t) => a + t.amount, 0))}: confirm these are personal and not business expenses.`);
  const meals = live.filter((t) => t.category === "meals");
  if (meals.length) questions.push(`Business meals total ${money(meals.reduce((a, t) => a + t.amount, 0))}: confirm the 50% treatment and the business purpose.`);
  const equip = live.filter((t) => t.category === "equipment" && t.amount >= 2500);
  if (equip.length) questions.push(`${equip.length} equipment purchase(s) of $2,500 or more: decide between expensing and depreciating.`);
  const costsNotReimb = costs.filter((t) => !t.reimbursable);
  if (costsNotReimb.length) questions.push(`${costsNotReimb.length} client cost(s) marked not reimbursable: confirm they should be deducted.`);
  const trust = live.filter((t) => t.account === "trust");
  if (trust.length) questions.push(`Trust (IOLTA) activity is listed separately and excluded from income. Reconcile it with your three-way trust reconciliation.`);
  const open = live.filter((t) => t.status === "needs_review");
  if (open.length) questions.push(`${open.length} transaction(s) were not reviewed before this package was prepared.`);
  const contract = live.filter((t) => t.category === "contract_labor");
  if (contract.length) questions.push(`Contract labor paid to ${new Set(contract.map((t) => t.counterparty.toLowerCase())).size} payee(s): check whether any need a 1099-NEC (generally $600+ in a year).`);

  return { score: Math.round(score), checks, questions };
}

// ── Bank / card CSV ───────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      // Only the file's actual delimiter splits cells.
      if (ch === delimiterOf(t)) { row.push(cell); cell = ""; } else cell += ch;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
  return rows;
}

let _delimCache: { text: string; d: string } | null = null;
function delimiterOf(text: string) {
  if (_delimCache?.text === text) return _delimCache.d;
  // Look at the first few lines: some banks put an info line above the header.
  const lines = text.split(/\r?\n/, 6);
  const counts = [",", ";", "\t"]
    .map((d) => [d, Math.max(...lines.map((l) => l.split(d).length))] as const)
    .sort((a, b) => b[1] - a[1]);
  _delimCache = { text, d: counts[0][1] > 1 ? counts[0][0] : "," };
  return _delimCache.d;
}

export type ColumnMap = { date: number; description: number; amount: number; debit: number; credit: number };

export function detectColumns(header: string[]): ColumnMap {
  const h = header.map((x) => x.toLowerCase());
  const find = (...names: RegExp[]) => h.findIndex((x) => names.some((n) => n.test(x)));
  return {
    date: find(/^(transaction |posting |post |trans\.? )?date/, /date$/),
    description: find(/description|payee|merchant|memo|details|narrative|name/),
    amount: find(/^amount$|^amount \(|transaction amount|^value$/),
    debit: find(/debit|withdrawal|money out|paid out|charge/),
    credit: find(/credit|deposit|money in|paid in|payment received/),
  };
}

export function parseMoney(v: string): number | null {
  if (!v) return null;
  const neg = /^\(.*\)$/.test(v.trim()) || /-/.test(v);
  const n = Number(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || v.replace(/[^0-9]/g, "") === "") return null;
  return neg ? -n : n;
}

export function parseDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]); // US banks: month first
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type ImportRow = { date: string; description: string; amount: number; kind: "income" | "expense" };

// Turns a bank/card CSV into rows. Card files often show purchases as
// positive numbers; flip tells us to treat positive as money out.
export function rowsFromCsv(rows: string[][], map: ColumnMap, flip: boolean): { rows: ImportRow[]; skipped: number } {
  const out: ImportRow[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = parseDate(r[map.date] ?? "");
    const description = (r[map.description] ?? "").slice(0, 500);
    let amt: number | null = null;
    if (map.amount >= 0) amt = parseMoney(r[map.amount] ?? "");
    else {
      const d = parseMoney(r[map.debit] ?? "");
      const c = parseMoney(r[map.credit] ?? "");
      amt = c ? Math.abs(c) : d ? -Math.abs(d) : null;
    }
    if (!date || amt === null || amt === 0) { skipped++; continue; }
    if (flip) amt = -amt;
    out.push({ date, description, amount: Math.abs(r2(amt)), kind: amt > 0 ? "income" : "expense" });
  }
  return { rows: out, skipped };
}
