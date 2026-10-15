import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { requireUserOrg } from "@/lib/data/documents";
import { templatesAllowed } from "@/lib/clients/templates";
import { categoryForCode, type LeapRow } from "@/lib/matters/leapImport";

// Bulk import of matters from LEAP (The Law Office of Piotr Rapciewicz only).
// Each row becomes a matter with its LEAP number, its client (reused by name or
// created), the property address and the other side in Details. Matters whose
// number already exists are skipped, so importing twice is safe.

export class ImportError extends Error {
  constructor(public status: 400 | 403, message: string) {
    super(message);
  }
}

const txt = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const CHUNK = 200; // rows saved per database call

export async function importLeapMatters(input: unknown) {
  const { user } = await requireUserOrg();
  if (!templatesAllowed(user.email)) throw new ImportError(403, "Importing from LEAP isn't set up for your firm.");
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const rows = (Array.isArray(input) ? input : []).slice(0, 1000) as Partial<LeapRow>[];
  if (!rows.length) throw new ImportError(400, "Nothing to import.");

  const [{ data: existing }, { data: clients }, { data: team }] = await Promise.all([
    db.from("matters").select("matter_number").eq("org_id", orgId).not("matter_number", "is", null).limit(20000),
    db.from("clients").select("id, name").eq("org_id", orgId).limit(20000),
    db.from("profiles").select("id, email, full_name").eq("org_id", orgId),
  ]);
  const taken = new Set(((existing ?? []) as { matter_number: string }[]).map((m) => m.matter_number.toUpperCase()));
  const clientByName = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const byInitials = new Map<string, string>();
  for (const p of (team ?? []) as { id: string; email: string; full_name?: string | null }[]) if (p.full_name) byInitials.set(initialsOf(p.full_name), p.id);

  const result = { created: 0, skipped: [] as string[], failed: [] as { number: string; error: string }[], clientsCreated: 0 };

  // 1. Clean the rows; leave out numbers already in LawPower (or twice in this file).
  type Clean = { number: string; code: string; client: string; address: string; other: string; leapStatus: string; matterType: string; resp: string };
  const todo: Clean[] = [];
  for (const r of rows) {
    const m = /^([A-Z][A-Z0-9]{1,5})-(\d{4})-(\d{3,6})$/.exec(txt(r.number, 30).toUpperCase());
    if (!m) continue;
    if (taken.has(m[0])) {
      result.skipped.push(m[0]);
      continue;
    }
    taken.add(m[0]);
    todo.push({
      number: m[0],
      code: m[1],
      client: txt(r.client, 200) || "Unknown client",
      address: txt(r.address, 300),
      other: txt(r.other, 300),
      leapStatus: txt(r.leapStatus, 80),
      matterType: txt(r.matterType, 300),
      resp: txt(r.resp, 10).toUpperCase(),
    });
  }

  // 2. New clients, all at once (one per name).
  const newNames = [...new Set(todo.map((t) => t.client).filter((n) => !clientByName.has(n.toLowerCase())))];
  for (let i = 0; i < newNames.length; i += CHUNK) {
    const batch = newNames.slice(i, i + CHUNK).map((name) => ({
      org_id: orgId,
      name,
      description: "Imported from LEAP",
      status: "Active",
      type: /\b(LLC|Inc\.?|Corp\.?|Trust|Estate of|LP|LLP)\b/i.test(name) ? "Legal entity" : "Individual",
    }));
    const { data, error } = await db.from("clients").insert(batch).select("id, name");
    if (error) throw error;
    for (const c of (data ?? []) as { id: string; name: string }[]) clientByName.set(c.name.trim().toLowerCase(), c.id);
    result.clientsCreated += (data ?? []).length;
  }

  // 3. Matters with their Details, in batches.
  const toInsert = todo.map((t) => {
    const closed = /file complete|not proceeding|closed|archived|cancel+ed/i.test(t.leapStatus);
    const values: Record<string, string> = {};
    if (t.code === "REP" || t.code === "REF") Object.assign(values, { buyerNames: t.client, ...(t.other ? { sellerNames: t.other } : {}) });
    else if (t.code === "RES") Object.assign(values, { sellerNames: t.client, ...(t.other ? { buyerNames: t.other } : {}) });
    else Object.assign(values, { clientNames: t.client, ...(t.other ? { otherNames: t.other } : {}) });
    if (t.address) values.property = t.address;
    // From LEAP (not "typed by hand"), so Fill from documents can still refine it.
    const details = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v.slice(0, 500), source: "LEAP" }]));
    return {
      number: t.number,
      row: {
        org_id: orgId,
        title: (t.address ? `${t.client} – ${t.address}` : t.client).slice(0, 300),
        description: [t.matterType, `Imported from LEAP${t.leapStatus ? ` · LEAP status: ${t.leapStatus}` : ""}`].filter(Boolean).join("\n"),
        status: closed ? "Closed" : "Active",
        client_id: clientByName.get(t.client.toLowerCase()) ?? null,
        category: categoryForCode(t.code),
        counterparty: t.other || null,
        billing_type: "Flat fee",
        matter_code: t.code,
        matter_number: t.number, // LEAP's number, kept as is (your own counter is unchanged)
        assigned_to: byInitials.get(t.resp) ?? null,
        details,
      },
    };
  });
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const batch = toInsert.slice(i, i + CHUNK);
    let { error } = await db.from("matters").insert(batch.map((b) => b.row));
    // Before 0028 there is no details column: save without it.
    if (error && /details/.test(error.message ?? "")) {
      const plain = batch.map((b) => {
        const { details: _d, ...rest } = b.row;
        void _d;
        return rest;
      });
      ({ error } = await db.from("matters").insert(plain));
    }
    if (!error) {
      result.created += batch.length;
      continue;
    }
    // A batch failed (e.g. someone created one of these numbers meanwhile): save its rows one by one.
    for (const b of batch) {
      const { error: e1 } = await db.from("matters").insert(b.row);
      if (e1) result.failed.push({ number: b.number, error: /duplicate|unique/i.test(e1.message ?? "") ? "already in LawPower" : (e1.message ?? "couldn't be created").slice(0, 160) });
      else result.created++;
    }
  }
  return result;
}
