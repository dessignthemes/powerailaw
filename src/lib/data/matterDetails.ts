import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanDetails, layoutFor, AI_FIELDS, type MatterDetails } from "@/lib/matters/details";

export class DetailsError extends Error {
  constructor(public status: 400 | 404 | 503, message: string) {
    super(message);
  }
}

const setup = () => new DetailsError(503, "Matter details aren't set up yet. Run supabase/migrations/0028_matter_details.sql in the Supabase SQL editor.");

async function load(orgId: string, matterId: string) {
  const { data, error } = await createAdminClient().from("matters").select("*").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new DetailsError(404, "Matter not found.");
  const m = data as Record<string, unknown>;
  if (!("details" in m)) throw setup();
  return m as { id: string; client_id: string | null; details: unknown; matter_code?: string | null; category?: string | null };
}

// Details, with our client's name, email and phone taken from the client record when empty.
export async function getDetails(orgId: string, matterId: string): Promise<MatterDetails> {
  const m = await load(orgId, matterId);
  const details = cleanDetails(m.details);
  const { side } = layoutFor({ matterCode: m.matter_code, category: m.category });
  const prefix = side ?? "client";
  if (m.client_id) {
    const { data: c } = await createAdminClient().from("clients").select("name, email, phone").eq("id", m.client_id).eq("org_id", orgId).maybeSingle();
    const client = c as { name?: string; email?: string | null; phone?: string | null } | null;
    const fill = (key: string, v: string | null | undefined) => {
      if (v?.trim() && !details[key]) details[key] = { value: v.trim(), source: "Client record" };
    };
    fill(`${prefix}Names`, client?.name);
    fill(`${prefix}Email`, client?.email);
    fill(`${prefix}Phone`, client?.phone);
  }
  return details;
}

// Values typed by hand: { price: "$535,000.00", lender: "" } ("" clears the field).
export async function saveDetails(orgId: string, matterId: string, changes: Record<string, unknown>): Promise<MatterDetails> {
  const m = await load(orgId, matterId);
  const details = cleanDetails(m.details);
  const allowed = new Set([...AI_FIELDS, "clientNames", "clientEmail", "clientPhone", "otherNames", "otherAttorneyFirm", "otherAttorneyName", "otherAttorneyEmail", "otherAttorneyPhone"]);
  for (const [k, v] of Object.entries(changes).slice(0, 80)) {
    if (!allowed.has(k)) continue;
    const value = typeof v === "string" ? v.trim().slice(0, 500) : "";
    if (value) details[k] = { value, manual: true };
    else delete details[k];
  }
  const { error } = await createAdminClient().from("matters").update({ details }).eq("id", matterId).eq("org_id", orgId);
  if (error) throw error;
  return getDetails(orgId, matterId);
}
