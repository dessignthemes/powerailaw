import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLawPay, type LawPayRow } from "@/lib/accounting/lawpay";
import { recordPayment } from "@/lib/data/invoices";

// Imports a LawPay transactions report into the AI Accountant:
//   payment to operating, matching an open invoice → recorded on that invoice (invoice → Paid)
//   payment to operating, no match                 → fee income to review (link it to a client)
//   payment to trust                               → trust deposit for that client (never income)
//   refund                                         → money out, to review
//   LawPay's processing fee                        → Bank & card fees (operating)
// Importing the same file again adds nothing twice.

const db = () => createAdminClient();
const INV = /\bINV-\d{4}-\d{3,}\b/i;
const tokens = (s: string) => s.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

type OpenInvoice = { id: string; number: string; total: number; paid: number; clientId: string | null; clientName: string; matterId: string | null };
export type PreviewLine = LawPayRow & {
  action: "invoice" | "income" | "trust" | "refund";
  invoice: { id: string; number: string; why: string } | null;
  client: { id: string; name: string } | null;
  duplicate: boolean;
};

async function context(orgId: string) {
  const [{ data: inv }, { data: cl }] = await Promise.all([
    db().from("invoices").select("id, number, total, amount_paid, client_id, matter_id, status").eq("org_id", orgId).in("status", ["unpaid", "partial"]).limit(2000),
    db().from("clients").select("id, name").eq("org_id", orgId).limit(5000),
  ]);
  const clients = (cl ?? []) as { id: string; name: string }[];
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const open: OpenInvoice[] = ((inv ?? []) as { id: string; number: string; total: number; amount_paid: number; client_id: string | null; matter_id: string | null }[]).map((i) => ({
    id: i.id,
    number: i.number,
    total: Number(i.total),
    paid: Number(i.amount_paid),
    clientId: i.client_id,
    clientName: i.client_id ? nameOf.get(i.client_id) ?? "" : "",
    matterId: i.matter_id,
  }));
  return { open, clients };
}

const similar = (a: string, b: string) => {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  return ta.length > 0 && ta.some((t) => tb.has(t));
};

function matchInvoice(r: LawPayRow, open: OpenInvoice[]) {
  const owed = (i: OpenInvoice) => Math.round((i.total - i.paid) * 100) / 100;
  const num = (r.reference.match(INV) ?? [])[0]?.toUpperCase();
  if (num) {
    const i = open.find((x) => x.number.toUpperCase() === num && owed(x) + 0.01 >= r.amount);
    if (i) return { id: i.id, number: i.number, why: "invoice number in the payment" };
  }
  const sameAmount = open.filter((x) => Math.abs(owed(x) - r.amount) < 0.01 && r.payer && similar(r.payer, x.clientName));
  if (sameAmount.length === 1) return { id: sameAmount[0].id, number: sameAmount[0].number, why: "same amount and client name" };
  return null;
}

function matchClient(r: LawPayRow, clients: { id: string; name: string }[]) {
  if (!r.payer) return null;
  const exact = clients.filter((c) => c.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/, "") === r.payer.toLowerCase());
  if (exact.length === 1) return exact[0];
  const close = clients.filter((c) => {
    const a = tokens(r.payer);
    const b = new Set(tokens(c.name));
    return a.length >= 2 && a.every((t) => b.has(t));
  });
  return close.length === 1 ? close[0] : null;
}

export async function previewLawPay(orgId: string, csv: string, defaultAccount: "operating" | "trust") {
  const parsed = parseLawPay(csv);
  const { open, clients } = await context(orgId);
  const refs = parsed.rows.map((r) => r.ref);
  const { data: existing } = refs.length ? await db().from("acct_transactions").select("external_ref").eq("org_id", orgId).in("external_ref", refs) : { data: [] };
  const done = new Set(((existing ?? []) as { external_ref: string }[]).map((x) => x.external_ref));
  const claimed = new Set<string>(); // one payment per open invoice within a file
  const lines: PreviewLine[] = parsed.rows.map((r) => {
    const account = r.account ?? defaultAccount;
    const row = { ...r, account };
    let invoice = null;
    if (r.type === "payment" && account === "operating") {
      const m = matchInvoice(row, open.filter((i) => !claimed.has(i.id)));
      if (m) {
        claimed.add(m.id);
        invoice = m;
      }
    }
    const client = invoice ? null : matchClient(row, clients);
    return { ...row, action: r.type === "refund" ? "refund" : account === "trust" ? "trust" : invoice ? "invoice" : "income", invoice, client, duplicate: done.has(r.ref) };
  });
  return { lines, skipped: parsed.skipped, hasAccountColumn: parsed.hasAccountColumn, columns: parsed.columns };
}

export async function importLawPay(orgId: string, userId: string, csv: string, defaultAccount: "operating" | "trust") {
  const { lines } = await previewLawPay(orgId, csv, defaultAccount);
  let invoices = 0;
  const rows: Record<string, unknown>[] = [];
  const method = (r: LawPayRow) => (r.method === "ach" ? "eCheck (LawPay)" : "Card (LawPay)");
  for (const l of lines) {
    if (l.duplicate) continue;
    const who = l.payer || "LawPay payment";
    const memo = l.reference ? ` · ${l.reference}` : "";
    if (l.action === "invoice" && l.invoice) {
      try {
        await recordPayment(orgId, userId, l.invoice.id, { date: l.date, amount: l.amount, method: l.method === "ach" ? "ach" : "card", externalRef: l.ref, note: "LawPay" });
        invoices++;
      } catch {
        // Couldn't record on the invoice (e.g. paid meanwhile): keep it as income to review.
        rows.push(income(l, who, memo, method(l)));
      }
    } else if (l.action === "income") rows.push(income(l, who, memo, method(l)));
    else if (l.action === "trust")
      rows.push({
        kind: "transfer", category: "trust_activity", account: "trust", txn_date: l.date, amount: l.amount, counterparty: who.slice(0, 200),
        description: `LawPay trust deposit · ${who}${memo}`.slice(0, 500), payment_method: method(l), client_id: l.client?.id ?? null,
        status: "needs_review", ai_reason: l.client ? "Trust deposit through LawPay" : "Trust deposit through LawPay; link it to the client", external_ref: l.ref,
      });
    else
      rows.push({
        kind: l.account === "trust" ? "transfer" : "expense", category: l.account === "trust" ? "trust_activity" : "other_expense", account: l.account ?? defaultAccount,
        txn_date: l.date, amount: l.amount, counterparty: who.slice(0, 200), description: `LawPay refund · ${who}${memo}`.slice(0, 500), payment_method: method(l),
        client_id: l.client?.id ?? null, status: "needs_review", ai_reason: "Refund through LawPay; your accountant may net it against fees", external_ref: l.ref,
      });
    if (l.fee > 0)
      rows.push({
        kind: "expense", category: "bank_fees", account: "operating", txn_date: l.date, amount: l.fee, counterparty: "LawPay",
        description: `LawPay processing fee · ${who}`.slice(0, 500), payment_method: "LawPay", status: "ready", ai_reason: "Card / eCheck processing fee", external_ref: `${l.ref}|fee`,
      });
  }
  let added = 0;
  if (rows.length) {
    const { data, error } = await db()
      .from("acct_transactions")
      .upsert(rows.map((r) => ({ org_id: orgId, created_by: userId, source: "bank_import", ai_confidence: 1, ...r })), { onConflict: "org_id,external_ref", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    added = data?.length ?? 0;
  }
  const dup = lines.filter((l) => l.duplicate).length;
  return { invoices, added, duplicates: dup, total: lines.length };

  function income(l: PreviewLine, who: string, memo: string, pm: string) {
    return {
      kind: "income", category: "legal_fees", account: "operating", txn_date: l.date, amount: l.amount, counterparty: who.slice(0, 200),
      description: `LawPay payment · ${who}${memo}`.slice(0, 500), payment_method: pm, client_id: l.client?.id ?? null,
      status: "needs_review", ai_reason: l.client ? "Fee payment through LawPay; no open invoice matched" : "Fee payment through LawPay; link it to a client or invoice", external_ref: l.ref,
    };
  }
}
