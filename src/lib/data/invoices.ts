import "server-only";
import { getPaymentSettings, payLink } from "@/lib/payments/settings";
import { createAdminClient } from "@/lib/supabase/admin";

// Invoices (operating account) and client trust balances.
// Every dollar received through an invoice is written to the AI Accountant ledger
// (operating, income) linked to the matter, client and invoice. Paying from trust
// also writes the trust side, so the matter's trust balance goes down.

export class InvoiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const db = () => createAdminClient();
const MIGRATION = "0046_invoices.sql";
const round2 = (n: number) => Math.round(n * 100) / 100;

function missing(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || e.code === "PGRST204" || /invoice/.test(e.message ?? ""));
}
const setup = () => new InvoiceError(`Invoices need a database update. Run supabase/migrations/${MIGRATION} in the Supabase SQL editor, then refresh.`, 503, "setup_required");
function check<T>(r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) {
    if (missing(r.error)) throw setup();
    throw r.error;
  }
  return r.data;
}

export type InvoiceLine = { kind: "flat" | "time" | "cost" | "other"; description: string; quantity: number; rate: number; amount: number; timeEntryId?: string | null };
export type Invoice = {
  id: string;
  matterId: string | null;
  clientId: string | null;
  number: string;
  issueDate: string;
  dueDate: string | null;
  status: "draft" | "pending" | "unpaid" | "partial" | "paid" | "void"; // draft → pending (approval) → unpaid → paid
  total: number;
  amountPaid: number;
  paidAt: string | null;
  notes: string;
  createdAt: string;
  createdBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewNote: string; // why it was sent back
  lines?: InvoiceLine[];
  payments?: { id: string; date: string; amount: number; method: string; fromTrust: boolean }[];
};

type Row = {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  number: string;
  issue_date: string;
  due_date: string | null;
  status: Invoice["status"];
  total: number;
  amount_paid: number;
  paid_at: string | null;
  notes: string;
  created_at: string;
  created_by?: string | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  review_note?: string | null;
};
const toInvoice = (r: Row): Invoice => ({
  id: r.id,
  matterId: r.matter_id,
  clientId: r.client_id,
  number: r.number,
  issueDate: r.issue_date,
  dueDate: r.due_date,
  status: r.status,
  total: Number(r.total) || 0,
  amountPaid: Number(r.amount_paid) || 0,
  paidAt: r.paid_at,
  notes: r.notes ?? "",
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  submittedBy: r.submitted_by ?? null,
  submittedAt: r.submitted_at ?? null,
  approvedBy: r.approved_by ?? null,
  approvedAt: r.approved_at ?? null,
  reviewNote: r.review_note ?? "",
});

async function matterOf(orgId: string, matterId: string) {
  const { data } = await db()
    .from("matters")
    .select("id, title, matter_number, client_id, billing_type, value, hourly_rate")
    .eq("org_id", orgId)
    .eq("id", matterId)
    .maybeSingle();
  if (!data) throw new InvoiceError("That matter wasn't found.", 404);
  return data as { id: string; title: string; matter_number: string | null; client_id: string | null; billing_type: string | null; value: number | null; hourly_rate: number | null };
}

export async function listInvoices(orgId: string, matterId?: string | null) {
  let q = db().from("invoices").select("*").eq("org_id", orgId).order("issue_date", { ascending: false }).order("number", { ascending: false }).limit(2000);
  if (matterId) q = q.eq("matter_id", matterId);
  return (check(await q) as Row[]).map(toInvoice);
}

export async function getInvoice(orgId: string, id: string): Promise<Invoice> {
  const row = check(await db().from("invoices").select("*").eq("org_id", orgId).eq("id", id).maybeSingle()) as Row | null;
  if (!row) throw new InvoiceError("That invoice wasn't found.", 404);
  const lines = check(await db().from("invoice_lines").select("kind, description, quantity, rate, amount").eq("invoice_id", id).order("position")) as {
    kind: InvoiceLine["kind"];
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  const pays = check(
    await db().from("acct_transactions").select("id, txn_date, amount, payment_method, account, kind").eq("org_id", orgId).eq("invoice_id", id).order("txn_date")
  ) as { id: string; txn_date: string; amount: number; payment_method: string; account: string; kind: string }[];
  return {
    ...toInvoice(row),
    lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity), rate: Number(l.rate), amount: Number(l.amount) })),
    payments: pays
      .filter((p) => p.account !== "trust" && p.kind === "income")
      .map((p) => ({ id: p.id, date: p.txn_date, amount: Number(p.amount), method: p.payment_method || "", fromTrust: /trust/i.test(p.payment_method || "") })),
  };
}

// What to bill for a matter right now: the flat fee (once), or billable time not yet billed.
export async function draftForMatter(orgId: string, matterId: string) {
  const m = await matterOf(orgId, matterId);
  const flat = m.billing_type === "Flat fee";
  const lines: InvoiceLine[] = [];
  if (flat) {
    const { data: earlier } = await db()
      .from("invoice_lines")
      .select("invoice_id, invoices!inner(matter_id, status)")
      .eq("org_id", orgId)
      .eq("kind", "flat")
      .eq("invoices.matter_id", matterId)
      .neq("invoices.status", "void")
      .limit(1);
    const value = Number(m.value ?? 0) || 0;
    if (!earlier?.length && value > 0) lines.push({ kind: "flat", description: `Flat fee: ${m.title}`.slice(0, 500), quantity: 1, rate: value, amount: value });
  } else {
    const r = await db()
      .from("time_entries")
      .select("id, entry_date, minutes, description, rate_cents")
      .eq("org_id", orgId)
      .eq("matter_id", matterId)
      .eq("billable", true)
      .is("invoice_id", null)
      .order("entry_date")
      .limit(500);
    const entries = check(r) as { id: string; entry_date: string; minutes: number; description: string; rate_cents: number | null }[];
    for (const e of entries) {
      const hours = round2(e.minutes / 60);
      const rate = e.rate_cents != null ? e.rate_cents / 100 : Number(m.hourly_rate ?? 0) || 0;
      lines.push({
        kind: "time",
        description: `${e.entry_date}: ${e.description || "Legal services"}`.slice(0, 500),
        quantity: hours,
        rate,
        amount: round2(hours * rate),
        timeEntryId: e.id,
      });
    }
  }
  return { matter: { id: m.id, title: m.title, number: m.matter_number, billingType: m.billing_type, clientId: m.client_id }, lines };
}

async function nextNumber(orgId: string, year: number) {
  const { data } = await db().from("invoices").select("number").eq("org_id", orgId).like("number", `INV-${year}-%`).limit(5000);
  let max = 0;
  for (const r of (data ?? []) as { number: string }[]) {
    const n = Number(r.number.split("-")[2]);
    if (n > max) max = n;
  }
  return max + 1;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createInvoice(
  orgId: string,
  userId: string,
  body: { matterId?: unknown; issueDate?: unknown; dueDate?: unknown; notes?: unknown; lines?: unknown; stage?: unknown },
  canApprove = true
): Promise<Invoice> {
  // draft: kept to finish later · pending: waits for the managing attorney · issue: approved now (owner / admin only).
  const stage = body.stage === "draft" ? "draft" : body.stage === "pending" || (body.stage === "issue" && !canApprove) ? "pending" : "unpaid";
  if (typeof body.matterId !== "string") throw new InvoiceError("Pick the matter to bill.");
  const m = await matterOf(orgId, body.matterId);
  const issueDate = typeof body.issueDate === "string" && DATE.test(body.issueDate) ? body.issueDate : new Date().toISOString().slice(0, 10);
  const dueDate = typeof body.dueDate === "string" && DATE.test(body.dueDate) ? body.dueDate : null;
  if (!Array.isArray(body.lines) || !body.lines.length) throw new InvoiceError("Add at least one line to bill.");
  if (body.lines.length > 200) throw new InvoiceError("That's too many lines for one invoice.");
  const lines: InvoiceLine[] = (body.lines as Record<string, unknown>[]).map((l) => {
    const quantity = round2(Number(l.quantity));
    const rate = round2(Number(l.rate));
    if (!Number.isFinite(quantity) || !Number.isFinite(rate) || quantity < 0 || rate < 0 || quantity > 100000 || rate > 100000000) throw new InvoiceError("Check the quantities and amounts.");
    return {
      kind: (["flat", "time", "cost", "other"] as const).includes(l.kind as InvoiceLine["kind"]) ? (l.kind as InvoiceLine["kind"]) : "other",
      description: String(l.description ?? "").trim().slice(0, 500) || "Legal services",
      quantity,
      rate,
      amount: round2(quantity * rate),
      timeEntryId: typeof l.timeEntryId === "string" && /^[0-9a-f-]{36}$/i.test(l.timeEntryId) ? l.timeEntryId : null,
    };
  });
  const total = round2(lines.reduce((n, l) => n + l.amount, 0));
  if (total <= 0) throw new InvoiceError("The invoice total must be more than $0.");

  // Time entries billed here: only this matter's, and only ones not billed already.
  const timeIds = lines.map((l) => l.timeEntryId).filter((x): x is string => !!x);
  if (timeIds.length) {
    const ok = check(await db().from("time_entries").select("id").eq("org_id", orgId).eq("matter_id", m.id).is("invoice_id", null).in("id", timeIds)) as { id: string }[];
    if (ok.length !== new Set(timeIds).size) throw new InvoiceError("Some of that time was already billed on another invoice. Start the invoice again.");
  }

  const year = Number(issueDate.slice(0, 4));
  let row: Row | null = null;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const n = (await nextNumber(orgId, year)) + attempt;
    const r = await db()
      .from("invoices")
      .insert({
        org_id: orgId,
        matter_id: m.id,
        client_id: m.client_id,
        number: `INV-${year}-${String(n).padStart(4, "0")}`,
        issue_date: issueDate,
        due_date: dueDate,
        total,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "",
        created_by: userId,
        ...(stage !== "unpaid" ? { status: stage } : {}),
        ...(stage === "pending" ? { submitted_by: userId, submitted_at: new Date().toISOString() } : {}),
        ...(stage === "unpaid" && body.stage === "issue" ? { approved_by: userId, approved_at: new Date().toISOString() } : {}),
      })
      .select("*")
      .single();
    if (r.error?.code === "23505") continue;
    if (r.error && (r.error.code === "23514" || r.error.code === "PGRST204" || /submitted_|approved_/.test(r.error.message ?? ""))) {
      throw new InvoiceError("Drafts and approvals need a database update first (migration 0061).", 503);
    }
    row = check(r) as Row;
  }
  if (!row) throw new InvoiceError("Couldn't give the invoice a number. Please try again.", 409);
  if (stage === "pending") await alertApprovers(orgId, userId, row.id, row.number, total);

  const lr = await db()
    .from("invoice_lines")
    .insert(lines.map((l, i) => ({ org_id: orgId, invoice_id: row!.id, position: i, kind: l.kind, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.amount })));
  if (lr.error) {
    await db().from("invoices").delete().eq("id", row.id);
    check(lr);
  }
  if (timeIds.length) await db().from("time_entries").update({ invoice_id: row.id }).eq("org_id", orgId).in("id", timeIds);
  return getInvoice(orgId, row.id);
}

// Client trust balances: deposits in, minus money paid out or moved to operating.
export async function trustBalances(orgId: string) {
  const r = await db().from("acct_transactions").select("matter_id, client_id, kind, amount, txn_date").eq("org_id", orgId).eq("account", "trust").neq("status", "excluded").limit(50000);
  const rows = check(r) as { matter_id: string | null; client_id: string | null; kind: string; amount: number; txn_date: string }[];
  const by = new Map<string, { matterId: string | null; clientId: string | null; deposits: number; paidOut: number; last: string }>();
  for (const t of rows) {
    const key = t.matter_id ?? `client:${t.client_id ?? "none"}`;
    const b = by.get(key) ?? { matterId: t.matter_id, clientId: t.client_id, deposits: 0, paidOut: 0, last: t.txn_date };
    if (t.kind === "income") b.deposits += Number(t.amount) || 0;
    else b.paidOut += Number(t.amount) || 0;
    if (t.txn_date > b.last) b.last = t.txn_date;
    by.set(key, b);
  }
  return [...by.values()].map((b) => ({ ...b, deposits: round2(b.deposits), paidOut: round2(b.paidOut), balance: round2(b.deposits - b.paidOut) })).sort((a, b) => b.balance - a.balance);
}

const METHODS: Record<string, string> = { check: "Check", wire: "Wire", ach: "ACH / bank transfer", card: "Card", cash: "Cash", trust: "From trust", other: "Other" };

// Records money received for an invoice. It goes into the operating ledger
// (income, linked to the matter, client and invoice). "From trust" also takes it
// out of the matter's trust balance (never more than what's in trust).
export async function recordPayment(orgId: string, userId: string, invoiceId: string, body: { date?: unknown; amount?: unknown; method?: unknown; externalRef?: string; note?: string }) {
  const inv = await getInvoice(orgId, invoiceId);
  if (inv.status === "void") throw new InvoiceError("This invoice was voided.");
  if (inv.status === "draft" || inv.status === "pending") throw new InvoiceError("This invoice hasn't been approved yet. Approve it first, then record the payment.");
  const remaining = round2(inv.total - inv.amountPaid);
  if (remaining <= 0) throw new InvoiceError("This invoice is already paid in full.");
  const amount = round2(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new InvoiceError("Enter the amount received.");
  if (amount > remaining + 0.001) throw new InvoiceError(`That's more than what's still owed (${remaining.toFixed(2)}).`);
  const date = typeof body.date === "string" && DATE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const method = typeof body.method === "string" && METHODS[body.method] ? body.method : "other";
  const fromTrust = method === "trust";

  let clientName = "";
  if (inv.clientId) {
    const { data } = await db().from("clients").select("name").eq("org_id", orgId).eq("id", inv.clientId).maybeSingle();
    clientName = (data as { name?: string } | null)?.name ?? "";
  }

  if (fromTrust) {
    if (!inv.matterId) throw new InvoiceError("Paying from trust needs the invoice to be on a matter.");
    const bal = (await trustBalances(orgId)).find((b) => b.matterId === inv.matterId)?.balance ?? 0;
    if (amount > bal + 0.001) throw new InvoiceError(`Only $${bal.toFixed(2)} is in trust for this matter, so it can't pay $${amount.toFixed(2)}.`);
  }

  // Claim the payment on the invoice first, guarded by the amount we read, so two
  // people recording at the same moment can't both count.
  const paid = round2(inv.amountPaid + amount);
  const full = paid >= inv.total - 0.001;
  const claimed = check(
    await db()
      .from("invoices")
      .update({ amount_paid: paid, status: full ? "paid" : "partial", paid_at: full ? date : null, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", inv.id)
      .eq("amount_paid", inv.amountPaid)
      .select("id")
  ) as { id: string }[];
  if (!claimed.length) throw new InvoiceError("Someone else just recorded a payment on this invoice. Refresh and check before adding another.", 409);

  const base = { org_id: orgId, txn_date: date, counterparty: clientName.slice(0, 200), amount, client_id: inv.clientId, matter_id: inv.matterId, status: "ready", source: "invoice", invoice_id: inv.id, created_by: userId };
  const rows = [
    ...(fromTrust
      ? [{ ...base, kind: "transfer", description: `Earned fees moved to operating: ${inv.number}`, category: "trust_activity", account: "trust", payment_method: "Transfer to operating" }]
      : []),
    {
      ...base,
      kind: "income",
      description: `Payment for ${inv.number}${body.note ? ` · ${body.note}` : ""}`.slice(0, 500),
      category: fromTrust ? "retainer_earned" : "legal_fees",
      account: "operating",
      payment_method: METHODS[method],
      ...(body.externalRef ? { external_ref: body.externalRef } : {}), // e.g. the LawPay transaction, so it's never imported twice
    },
  ];
  const ins = await db().from("acct_transactions").insert(rows);
  if (ins.error) {
    // Undo the claim so the invoice doesn't show money that isn't in the ledger.
    await db().from("invoices").update({ amount_paid: inv.amountPaid, status: inv.status, paid_at: inv.paidAt }).eq("org_id", orgId).eq("id", inv.id);
    check(ins);
  }
  return getInvoice(orgId, inv.id);
}

// Deletes an invoice made by mistake. Its payment entries in the books (the
// income entry, and the trust transfer if paid from trust) go with it, and any
// time billed on it becomes unbilled again.
export async function deleteInvoice(orgId: string, id: string) {
  await getInvoice(orgId, id);
  check(await db().from("acct_transactions").delete().eq("org_id", orgId).eq("invoice_id", id));
  await db().from("time_entries").update({ invoice_id: null }).eq("org_id", orgId).eq("invoice_id", id);
  check(await db().from("invoices").delete().eq("org_id", orgId).eq("id", id));
}

// Everything the printable invoice shows: firm, client, matter, lines, payments.
export async function invoiceForPrint(orgId: string, id: string) {
  const inv = await getInvoice(orgId, id);
  const [org, client, matter] = await Promise.all([
    db().from("organizations").select("name, logo_url").eq("id", orgId).maybeSingle(),
    inv.clientId ? db().from("clients").select("name, email, phone, address").eq("org_id", orgId).eq("id", inv.clientId).maybeSingle() : Promise.resolve({ data: null }),
    inv.matterId ? db().from("matters").select("title, matter_number").eq("org_id", orgId).eq("id", inv.matterId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const firm = ((org.data as { name?: string } | null)?.name ?? "").trim();
  // "Pay online" with LawPay (Administration → Online payments), while money is owed.
  const owed = round2(inv.total - inv.amountPaid);
  const pay = await getPaymentSettings(orgId);
  return {
    invoice: inv,
    payUrl: owed > 0 && inv.status !== "void" && inv.status !== "draft" && inv.status !== "pending" && pay.lawpayOperatingUrl ? payLink(pay.lawpayOperatingUrl, { amount: owed, reference: inv.number }) : null,
    payPage: pay.lawpayOperatingUrl || null,
    // A placeholder (the owner's email) isn't a firm name.
    firm: { name: firm && !firm.includes("@") ? firm : "", logoUrl: (org.data as { logo_url?: string | null } | null)?.logo_url ?? null },
    client: client.data as { name: string; email: string | null; phone: string | null; address: string | null } | null,
    matter: matter.data ? { title: (matter.data as { title: string }).title, number: (matter.data as { matter_number: string | null }).matter_number } : null,
  };
}

// ── Approval (the managing attorney: the workspace owner or an admin) ────────

export async function roleOf(orgId: string, userId: string): Promise<{ canApprove: boolean; name: string }> {
  const { data } = await db().from("profiles").select("role, full_name, email").eq("org_id", orgId).eq("id", userId).maybeSingle();
  const r = data as { role?: string; full_name?: string | null; email?: string | null } | null;
  return { canApprove: r?.role === "owner" || r?.role === "admin", name: r?.full_name || r?.email || "Someone" };
}

async function notify(orgId: string, to: string[], actorId: string, invoiceId: string, title: string) {
  if (!to.length) return;
  const { name } = await roleOf(orgId, actorId);
  const { error } = await db()
    .from("notifications")
    .insert(to.filter((u) => u !== actorId).map((uid) => ({ org_id: orgId, user_id: uid, kind: "invoice_approval", ref_id: invoiceId, board_id: null, title: title.slice(0, 300), actor_id: actorId, actor_name: name.slice(0, 120) })));
  if (error && !/notifications_kind_check|notifications/.test(error.message ?? "")) console.error("Invoice alert failed:", error.message);
}

async function alertApprovers(orgId: string, actorId: string, invoiceId: string, number: string, total: number) {
  const { data } = await db().from("profiles").select("id").eq("org_id", orgId).in("role", ["owner", "admin"]);
  await notify(orgId, ((data ?? []) as { id: string }[]).map((p) => p.id), actorId, invoiceId, `${number} · ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} is waiting for your approval`).catch(() => undefined);
}

// submit: draft → waiting for approval · approve: draft / waiting → issued (unpaid)
// return: waiting → draft, with a note · reopen: an issued invoice with no payments → draft.
export async function changeStage(orgId: string, userId: string, id: string, body: { action?: unknown; note?: unknown }): Promise<Invoice> {
  const inv = await getInvoice(orgId, id);
  const { canApprove } = await roleOf(orgId, userId);
  const now = new Date().toISOString();
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  let patch: Record<string, unknown>;
  let from: Invoice["status"][];
  switch (body.action) {
    case "submit":
      from = ["draft"];
      patch = { status: "pending", submitted_by: userId, submitted_at: now, review_note: "" };
      break;
    case "approve":
      if (!canApprove) throw new InvoiceError("Only the managing attorney (the workspace owner or an admin) can approve invoices.", 403);
      from = ["draft", "pending"];
      patch = { status: "unpaid", approved_by: userId, approved_at: now, review_note: "" };
      break;
    case "return":
      if (!canApprove) throw new InvoiceError("Only the managing attorney (the workspace owner or an admin) can send invoices back.", 403);
      from = ["pending"];
      patch = { status: "draft", review_note: note };
      break;
    case "reopen":
      if (!canApprove) throw new InvoiceError("Only the managing attorney (the workspace owner or an admin) can turn an issued invoice back into a draft.", 403);
      if (inv.amountPaid > 0) throw new InvoiceError("This invoice already has payments, so it can't go back to being a draft.");
      from = ["unpaid"];
      patch = { status: "draft", approved_by: null, approved_at: null };
      break;
    default:
      throw new InvoiceError("Unknown action.");
  }
  if (!from.includes(inv.status)) throw new InvoiceError("This invoice has moved on since you opened it. Refresh and try again.", 409);
  const r = await db().from("invoices").update({ ...patch, updated_at: now }).eq("org_id", orgId).eq("id", id).eq("status", inv.status).select("id");
  if (r.error) {
    if (r.error.code === "23514" || /submitted_|approved_|review_note/.test(r.error.message ?? "")) throw new InvoiceError("Drafts and approvals need a database update first (migration 0061).", 503);
    throw r.error;
  }
  if (!(r.data ?? []).length) throw new InvoiceError("This invoice has moved on since you opened it. Refresh and try again.", 409);
  const money = inv.total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (body.action === "submit") await alertApprovers(orgId, userId, id, inv.number, inv.total);
  const sender = inv.submittedBy ?? inv.createdBy;
  if ((body.action === "approve" || body.action === "return") && sender)
    await notify(orgId, [sender], userId, id, body.action === "approve" ? `${inv.number} · ${money} was approved` : `${inv.number} was sent back${note ? `: ${note}` : ""}`).catch(() => undefined);
  return getInvoice(orgId, id);
}

// Who owes what: issued invoices not fully paid, by client.
export async function outstandingByClient(orgId: string) {
  const r = await db().from("invoices").select("client_id, total, amount_paid, due_date, status").eq("org_id", orgId).in("status", ["unpaid", "partial"]).limit(20000);
  const rows = check(r) as { client_id: string | null; total: number; amount_paid: number; due_date: string | null }[];
  const today = new Date().toISOString().slice(0, 10);
  const by = new Map<string, { clientId: string | null; owed: number; overdue: number; count: number; oldestDue: string | null }>();
  for (const x of rows) {
    const key = x.client_id ?? "none";
    const b = by.get(key) ?? { clientId: x.client_id, owed: 0, overdue: 0, count: 0, oldestDue: null };
    const owed = round2((Number(x.total) || 0) - (Number(x.amount_paid) || 0));
    b.owed = round2(b.owed + owed);
    b.count++;
    if (x.due_date && x.due_date < today) b.overdue = round2(b.overdue + owed);
    if (x.due_date && (!b.oldestDue || x.due_date < b.oldestDue)) b.oldestDue = x.due_date;
    by.set(key, b);
  }
  return [...by.values()].filter((b) => b.owed > 0).sort((a, b) => b.owed - a.owed);
}
