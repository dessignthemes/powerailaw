// Shared bits for invoice screens (AI Accountant → Operating → Invoices, and each matter).

export type InvoiceLine = { kind: "flat" | "time" | "cost" | "other"; description: string; quantity: number; rate: number; amount: number; timeEntryId?: string | null };
export type Invoice = {
  id: string;
  matterId: string | null;
  clientId: string | null;
  number: string;
  issueDate: string;
  dueDate: string | null;
  status: "unpaid" | "partial" | "paid" | "void";
  total: number;
  amountPaid: number;
  paidAt: string | null;
  notes: string;
  createdAt: string;
  lines?: InvoiceLine[];
  payments?: { id: string; date: string; amount: number; method: string; fromTrust: boolean }[];
};

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Paid / Partly paid / Overdue / Unpaid, with the colours used everywhere.
export function statusOf(inv: Invoice): { label: string; cls: string } {
  if (inv.status === "paid") return { label: "Paid", cls: "bg-[#CAF0D9] text-[#14532D]" };
  if (inv.status === "void") return { label: "Void", cls: "bg-card-alt text-muted" };
  const overdue = !!inv.dueDate && inv.dueDate < todayIso();
  if (inv.status === "partial") return { label: overdue ? "Partly paid · overdue" : "Partly paid", cls: "bg-[#FFF1DE] text-[#8A4B14]" };
  return overdue ? { label: "Overdue", cls: "bg-[#FDE2E2] text-[#9F1D1D]" } : { label: "Unpaid", cls: "bg-[#E1E7F5] text-ink" };
}

export async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong. Please try again."), { code: d?.code });
  return d;
}

export const METHODS: [string, string][] = [
  ["check", "Check"],
  ["wire", "Wire"],
  ["ach", "ACH / bank transfer"],
  ["card", "Card"],
  ["cash", "Cash"],
  ["trust", "From trust (earned fees)"],
  ["other", "Other"],
];
