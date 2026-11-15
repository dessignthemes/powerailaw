import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMatterContacts } from "@/lib/data/matterContacts";
import { cleanDetails } from "@/lib/matters/details";

export const dynamic = "force-dynamic";

type Person = { name: string; email: string; role: string };
const isEmail = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);

// GET → who an email from this matter can go to: { matter: people on the matter
// (the client, linked contacts, people in its Details), staff: the firm's team }.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ matter: [], staff: [] });
    const db = createAdminClient();
    const seen = new Set<string>();
    const matter: Person[] = [];
    const add = (list: Person[], name: string, email: string | null | undefined, role: string) => {
      const e = (email ?? "").trim().toLowerCase();
      if (!isEmail(e) || seen.has(e)) return;
      seen.add(e);
      list.push({ name: name.trim() || e, email: e, role });
    };

    const { data: m } = await db.from("matters").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
    const row = m as { client_id?: string | null; details?: unknown } | null;
    if (!row) return NextResponse.json({ matter: [], staff: [] });
    // The matter's client.
    if (row.client_id) {
      const { data: c } = await db.from("clients").select("name, email").eq("id", row.client_id).eq("org_id", orgId).maybeSingle();
      if (c) add(matter, (c as { name: string }).name, (c as { email?: string | null }).email, "Client");
    }
    // Linked contacts (Details link people automatically; Related contacts by hand).
    for (const c of await listMatterContacts(orgId, id).catch(() => [])) add(matter, c.name, c.email, c.role || (c.kind === "client" ? "Client" : "Contact"));
    // People in Details with an email (e.g. the buyer's email, the realtor's).
    const d = cleanDetails(row.details);
    const pairs: [string, string, string][] = [
      ["buyerNames", "buyerEmail", "Buyer"],
      ["sellerNames", "sellerEmail", "Seller"],
      ["clientNames", "clientEmail", "Client"],
      ["buyerAgentName", "buyerAgentEmail", "Buyer's realtor"],
      ["listingAgentName", "listingAgentEmail", "Listing agent"],
      ["buyerAttorneyName", "buyerAttorneyEmail", "Buyer's attorney"],
      ["sellerAttorneyName", "sellerAttorneyEmail", "Seller's attorney"],
      ["otherAttorneyName", "otherAttorneyEmail", "Other side's attorney"],
      ["referralName", "referralEmail", "Referred by"],
    ];
    for (const [n, e, role] of pairs) add(matter, d[n]?.value ?? "", d[e]?.value, role);

    // The firm's staff.
    const staff: Person[] = [];
    const { data: team } = await db.from("profiles").select("full_name, email, role").eq("org_id", orgId);
    for (const p of (team ?? []) as { full_name?: string | null; email?: string | null; role?: string | null }[]) {
      const e = (p.email ?? "").toLowerCase();
      if (!isEmail(e)) continue;
      staff.push({ name: p.full_name || e, email: e, role: p.role === "owner" ? "Owner" : p.role === "admin" ? "Admin" : "Staff" });
    }
    staff.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ matter, staff }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/matters/[id]/recipients failed:", e);
    return NextResponse.json({ matter: [], staff: [] });
  }
}
