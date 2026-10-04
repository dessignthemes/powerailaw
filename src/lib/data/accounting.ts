import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { getSessionUser } from "@/lib/auth";
import { CAT, type Txn } from "@/lib/accounting/core";

export const RECEIPTS_BUCKET = "accounting-receipts";
export const ACCOUNTING_MIGRATION = "0017_ai_accountant.sql";

export class AcctError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 503, message: string, public code?: string) {
    super(message);
  }
}

export function setupError() {
  return new AcctError(
    503,
    `The AI Accountant needs a database update. Run supabase/migrations/${ACCOUNTING_MIGRATION} in the Supabase SQL editor, then refresh.`,
    "setup_required"
  );
}

function missingTable(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "PGRST205" || e.code === "42P01" || /acct_transactions/.test(e.message ?? ""));
}

type Row = {
  id: string; kind: Txn["kind"]; txn_date: string; description: string; counterparty: string; amount: string | number;
  category: string; account: Txn["account"]; payment_method: string; client_id: string | null; matter_id: string | null;
  reimbursable: boolean; notes: string; status: Txn["status"]; source: Txn["source"]; receipt_path: string | null;
  receipt_name: string | null; ai_confidence: string | number | null; ai_reason: string; created_at: string;
};

const toTxn = (r: Row): Txn => ({
  id: r.id, kind: r.kind, date: r.txn_date, description: r.description, counterparty: r.counterparty,
  amount: Number(r.amount), category: CAT[r.category] ? r.category : "uncategorized", account: r.account,
  paymentMethod: r.payment_method, clientId: r.client_id, matterId: r.matter_id, reimbursable: r.reimbursable,
  notes: r.notes, status: r.status, source: r.source, receiptPath: r.receipt_path, receiptName: r.receipt_name,
  aiConfidence: r.ai_confidence === null ? null : Number(r.ai_confidence), aiReason: r.ai_reason, createdAt: r.created_at,
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input = z.object({
  kind: z.enum(["income", "expense", "transfer"]),
  date: dateStr,
  description: z.string().max(500).default(""),
  counterparty: z.string().max(200).default(""),
  amount: z.number().min(0).max(999_999_999),
  category: z.string().refine((k) => !!CAT[k], "Unknown category"),
  account: z.enum(["operating", "trust", "credit_card", "other"]).default("operating"),
  paymentMethod: z.string().max(60).default(""),
  clientId: z.string().uuid().nullable().default(null),
  matterId: z.string().uuid().nullable().default(null),
  reimbursable: z.boolean().default(false),
  notes: z.string().max(2000).default(""),
  status: z.enum(["needs_review", "ready", "excluded"]).default("ready"),
  receiptPath: z.string().max(300).nullable().default(null),
  receiptName: z.string().max(200).nullable().default(null),
  source: z.enum(["manual", "receipt", "bank_import"]).default("manual"),
  aiConfidence: z.number().min(0).max(1).nullable().default(null),
  aiReason: z.string().max(500).default(""),
});

function parse(body: unknown, partial = false) {
  const res = (partial ? input.partial() : input).safeParse(body);
  if (!res.success) throw new AcctError(400, res.error.issues[0]?.message ?? "Please check the details.");
  return res.data;
}

async function ctx() {
  const user = await getSessionUser();
  if (!user) throw new AcctError(401, "Please sign in again.");
  return { orgId: await getCurrentOrgId(), userId: user.id };
}

function receiptBelongs(path: string | null | undefined, orgId: string) {
  if (path && (!path.startsWith(`${orgId}/`) || path.includes("..") || !/^[0-9a-f-]+\/[0-9a-f-]+\.(pdf|png|jpg|webp)$/.test(path))) {
    throw new AcctError(403, "That receipt doesn't belong to this workspace.");
  }
}

async function checkLinks(orgId: string, v: { clientId?: string | null; matterId?: string | null }) {
  const s = createAdminClient();
  if (v.clientId) {
    const { data } = await s.from("clients").select("id").eq("id", v.clientId).eq("org_id", orgId).maybeSingle();
    if (!data) throw new AcctError(400, "That client wasn't found.");
  }
  if (v.matterId) {
    const { data } = await s.from("matters").select("id").eq("id", v.matterId).eq("org_id", orgId).maybeSingle();
    if (!data) throw new AcctError(400, "That matter wasn't found.");
  }
}

const toRow = (v: Partial<ReturnType<typeof parse>>) => {
  const r: Record<string, unknown> = {};
  const map: [keyof typeof v, string][] = [
    ["kind", "kind"], ["date", "txn_date"], ["description", "description"], ["counterparty", "counterparty"], ["amount", "amount"],
    ["category", "category"], ["account", "account"], ["paymentMethod", "payment_method"], ["clientId", "client_id"],
    ["matterId", "matter_id"], ["reimbursable", "reimbursable"], ["notes", "notes"], ["status", "status"],
    ["receiptPath", "receipt_path"], ["receiptName", "receipt_name"], ["source", "source"], ["aiConfidence", "ai_confidence"], ["aiReason", "ai_reason"],
  ];
  for (const [k, col] of map) if (v[k] !== undefined) r[col] = v[k];
  return r;
};

export async function listTxns(from: string, to: string): Promise<Txn[]> {
  const { orgId } = await ctx();
  const { data, error } = await createAdminClient()
    .from("acct_transactions")
    .select("*")
    .eq("org_id", orgId)
    .gte("txn_date", from)
    .lte("txn_date", to)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  return (data as Row[]).map(toTxn);
}

export async function createTxn(body: unknown): Promise<Txn> {
  const { orgId, userId } = await ctx();
  const v = parse(body);
  receiptBelongs(v.receiptPath, orgId);
  await checkLinks(orgId, v);
  const { data, error } = await createAdminClient()
    .from("acct_transactions")
    .insert({ ...toRow(v), org_id: orgId, created_by: userId })
    .select("*")
    .single();
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  return toTxn(data as Row);
}

export async function updateTxn(id: string, body: unknown): Promise<Txn> {
  const { orgId } = await ctx();
  const v = parse(body, true);
  receiptBelongs(v.receiptPath, orgId);
  await checkLinks(orgId, v);
  const { data, error } = await createAdminClient()
    .from("acct_transactions")
    .update({ ...toRow(v), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  if (!data) throw new AcctError(404, "That transaction wasn't found.");
  return toTxn(data as Row);
}

export async function bulkUpdate(ids: string[], body: unknown): Promise<number> {
  const { orgId } = await ctx();
  const v = parse(body, true);
  const { data, error } = await createAdminClient()
    .from("acct_transactions")
    .update({ ...toRow(v), updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .in("id", ids.slice(0, 1000))
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function deleteTxn(id: string) {
  const { orgId } = await ctx();
  const s = createAdminClient();
  const { data } = await s.from("acct_transactions").delete().eq("id", id).eq("org_id", orgId).select("receipt_path").maybeSingle();
  if (data?.receipt_path) await s.storage.from(RECEIPTS_BUCKET).remove([data.receipt_path]);
}

// Bank/card lines: dedupe on a fingerprint so re-importing is harmless.
export async function importRows(
  rows: { date: string; description: string; amount: number; kind: "income" | "expense"; category: string; counterparty: string; confidence: number; reason: string }[],
  account: Txn["account"]
) {
  const { orgId, userId } = await ctx();
  const seen = new Map<string, number>();
  const records = rows.map((r) => {
    const base = `${account}|${r.date}|${r.kind}|${r.amount.toFixed(2)}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = (seen.get(base) ?? 0) + 1; // same line twice in one file is kept
    seen.set(base, n);
    const kind = CAT[r.category]?.kind === "transfer" ? "transfer" : r.kind;
    return {
      org_id: orgId, created_by: userId, kind, txn_date: r.date, description: r.description.slice(0, 500),
      counterparty: r.counterparty.slice(0, 200), amount: r.amount, category: r.category, account,
      status: "needs_review", source: "bank_import", external_ref: `${base}|${n}`.slice(0, 600),
      ai_confidence: r.confidence, ai_reason: r.reason.slice(0, 500), reimbursable: r.category === "client_costs",
    };
  });
  const { data, error } = await createAdminClient()
    .from("acct_transactions")
    .upsert(records, { onConflict: "org_id,external_ref", ignoreDuplicates: true })
    .select("id");
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  return { added: data?.length ?? 0, duplicates: records.length - (data?.length ?? 0) };
}

export async function receiptUploadUrl(fileName: string, size: number) {
  const { orgId } = await ctx();
  const ext = fileName.toLowerCase().match(/\.(pdf|png|jpe?g|webp)$/)?.[1]?.replace("jpeg", "jpg");
  if (!ext) throw new AcctError(400, "Receipts can be PDF, PNG, JPEG or WebP.");
  if (size <= 0 || size > 15 * 1024 * 1024) throw new AcctError(400, "Receipts must be 15 MB or smaller.");
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from(RECEIPTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    if (/bucket/i.test(error?.message ?? "")) throw setupError();
    throw error ?? new Error("upload url failed");
  }
  return { path, token: data.token };
}

export async function receiptBytes(path: string) {
  const { orgId } = await ctx();
  receiptBelongs(path, orgId);
  const { data, error } = await createAdminClient().storage.from(RECEIPTS_BUCKET).download(path);
  if (error || !data) throw new AcctError(404, "That receipt wasn't found.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function receiptSignedUrls(paths: string[]) {
  const { orgId } = await ctx();
  const clean = paths.filter((p) => p.startsWith(`${orgId}/`)).slice(0, 2000);
  if (!clean.length) return {};
  const { data } = await createAdminClient().storage.from(RECEIPTS_BUCKET).createSignedUrls(clean, 600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

// Billable time recorded in the period, by matter (for the accountant's
// work-in-progress view; most small firms report income when paid).
export async function timeSummary(from: string, to: string) {
  const { orgId } = await ctx();
  const s = createAdminClient();
  const { data, error } = await s
    .from("time_entries")
    .select("minutes, billable, rate_cents, matter_id")
    .eq("org_id", orgId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .limit(20000);
  if (error) return [];
  const by = new Map<string | null, { matterId: string | null; billableMinutes: number; otherMinutes: number; valueCents: number }>();
  for (const e of data ?? []) {
    const row = by.get(e.matter_id) ?? { matterId: e.matter_id, billableMinutes: 0, otherMinutes: 0, valueCents: 0 };
    if (e.billable) {
      row.billableMinutes += e.minutes;
      row.valueCents += Math.round((e.minutes / 60) * (e.rate_cents ?? 0));
    } else row.otherMinutes += e.minutes;
    by.set(e.matter_id, row);
  }
  return [...by.values()].sort((a, b) => b.valueCents - a.valueCents);
}
