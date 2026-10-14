import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { requireUserOrg } from "@/lib/data/documents";
import { templatesAllowed } from "@/lib/clients/templates";
import { saveDetails } from "@/lib/data/matterDetails";
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

export async function importLeapMatters(input: unknown) {
  const { user } = await requireUserOrg();
  if (!templatesAllowed(user.email)) throw new ImportError(403, "Importing from LEAP isn't set up for your firm.");
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const rows = (Array.isArray(input) ? input : []).slice(0, 500) as Partial<LeapRow>[];
  if (!rows.length) throw new ImportError(400, "Nothing to import.");

  const [{ data: existing }, { data: clients }, { data: team }] = await Promise.all([
    db.from("matters").select("matter_number").eq("org_id", orgId).not("matter_number", "is", null),
    db.from("clients").select("id, name").eq("org_id", orgId),
    db.from("profiles").select("id, email, full_name").eq("org_id", orgId),
  ]);
  const taken = new Set(((existing ?? []) as { matter_number: string }[]).map((m) => m.matter_number.toUpperCase()));
  const clientByName = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.name.trim().toLowerCase(), c.id]));
  const byInitials = new Map<string, string>();
  for (const p of (team ?? []) as { id: string; email: string; full_name?: string | null }[]) if (p.full_name) byInitials.set(initialsOf(p.full_name), p.id);

  const result = { created: 0, skipped: [] as string[], failed: [] as { number: string; error: string }[], clientsCreated: 0 };
  for (const r of rows) {
    const m = /^([A-Z][A-Z0-9]{1,5})-(\d{4})-(\d{3,6})$/.exec(txt(r.number, 30).toUpperCase());
    if (!m) continue;
    const number = m[0];
    if (taken.has(number)) {
      result.skipped.push(number);
      continue;
    }
    try {
      const code = m[1];
      const clientName = txt(r.client, 200) || "Unknown client";
      const address = txt(r.address, 300);
      const other = txt(r.other, 300);
      const leapStatus = txt(r.leapStatus, 80);
      const closed = /file complete|not proceeding|closed|archived|cancel+ed/i.test(leapStatus);

      let clientId = clientByName.get(clientName.toLowerCase()) ?? null;
      if (!clientId) {
        const { data: c, error } = await db
          .from("clients")
          .insert({ org_id: orgId, name: clientName, description: "Imported from LEAP", status: "Active", type: /\b(LLC|Inc\.?|Corp\.?|Trust|Estate of|LP|LLP)\b/i.test(clientName) ? "Legal entity" : "Individual" })
          .select("id")
          .single();
        if (error) throw error;
        clientId = c.id as string;
        clientByName.set(clientName.toLowerCase(), clientId);
        result.clientsCreated++;
      }

      const { data: matter, error } = await db
        .from("matters")
        .insert({
          org_id: orgId,
          title: (address ? `${clientName} – ${address}` : clientName).slice(0, 300),
          description: [txt(r.matterType, 300), `Imported from LEAP${leapStatus ? ` · LEAP status: ${leapStatus}` : ""}`].filter(Boolean).join("\n"),
          status: closed ? "Closed" : "Active",
          client_id: clientId,
          category: categoryForCode(code),
          counterparty: other || null,
          billing_type: "Flat fee",
          matter_code: code,
          matter_number: number, // LEAP's number, kept as is (your own counter is unchanged)
          assigned_to: byInitials.get(txt(r.resp, 10).toUpperCase()) ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      taken.add(number);

      // Details: who's who and the property.
      const values: Record<string, string> = {};
      if (code === "REP" || code === "REF") Object.assign(values, { buyerNames: clientName, ...(other ? { sellerNames: other } : {}) });
      else if (code === "RES") Object.assign(values, { sellerNames: clientName, ...(other ? { buyerNames: other } : {}) });
      else Object.assign(values, { clientNames: clientName, ...(other ? { otherNames: other } : {}) });
      if (address) values.property = address;
      await saveDetails(orgId, matter.id as string, values).catch(() => null); // before 0028: no Details yet
      result.created++;
    } catch (e) {
      result.failed.push({ number, error: (e as Error)?.message?.slice(0, 200) ?? "Couldn't be created." });
    }
  }
  return result;
}
