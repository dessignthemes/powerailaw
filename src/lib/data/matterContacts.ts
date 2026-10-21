import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// People and companies on a matter, each with a role (Realtor, Seller's attorney…).
// A link points at a contact (Contacts) or a client, never both.

export class MatterContactError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const db = () => createAdminClient();
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
function check<T>(r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "PGRST205" || /matter_contacts/.test(r.error.message ?? ""))
      throw new MatterContactError("Contacts on matters need a database update. Run supabase/migrations/0047_matter_contacts.sql in the Supabase SQL editor, then refresh.", 503, "setup_required");
    throw r.error;
  }
  return r.data;
}

export type MatterContact = {
  id: string; // the link
  matterId: string;
  role: string;
  kind: "contact" | "client";
  targetId: string;
  name: string;
  type: string; // person / company / Individual / Legal entity
  email: string | null;
  phone: string | null;
  company: string;
};

type LinkRow = { id: string; matter_id: string; contact_id: string | null; client_id: string | null; role: string };

async function describe(orgId: string, rows: LinkRow[]): Promise<MatterContact[]> {
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
  const [contacts, clients] = await Promise.all([
    contactIds.length ? db().from("contacts").select("id, kind, name, email, phone, company").eq("org_id", orgId).in("id", contactIds) : Promise.resolve({ data: [] }),
    clientIds.length ? db().from("clients").select("id, type, name, email, phone").eq("org_id", orgId).in("id", clientIds) : Promise.resolve({ data: [] }),
  ]);
  const cMap = new Map(((contacts.data ?? []) as { id: string; kind: string; name: string; email: string | null; phone: string | null; company: string }[]).map((c) => [c.id, c]));
  const kMap = new Map(((clients.data ?? []) as { id: string; type: string; name: string; email: string | null; phone: string | null }[]).map((c) => [c.id, c]));
  return rows
    .map((r): MatterContact | null => {
      if (r.contact_id) {
        const c = cMap.get(r.contact_id);
        if (!c) return null;
        return { id: r.id, matterId: r.matter_id, role: r.role, kind: "contact", targetId: c.id, name: c.name, type: c.kind, email: c.email, phone: c.phone, company: c.company ?? "" };
      }
      const k = r.client_id ? kMap.get(r.client_id) : null;
      if (!k) return null;
      return { id: r.id, matterId: r.matter_id, role: r.role, kind: "client", targetId: k.id, name: k.name, type: k.type, email: k.email, phone: k.phone, company: "" };
    })
    .filter((x): x is MatterContact => !!x);
}

export async function listMatterContacts(orgId: string, matterId: string) {
  const rows = check(await db().from("matter_contacts").select("id, matter_id, contact_id, client_id, role").eq("org_id", orgId).eq("matter_id", matterId).order("created_at")) as LinkRow[];
  return describe(orgId, rows);
}

// The matters a contact or client is on (as a linked contact, not as the matter's own client).
export async function mattersOfContact(orgId: string, who: { contactId?: string | null; clientId?: string | null }) {
  let q = db().from("matter_contacts").select("id, matter_id, role").eq("org_id", orgId);
  if (isId(who.contactId)) q = q.eq("contact_id", who.contactId);
  else if (isId(who.clientId)) q = q.eq("client_id", who.clientId);
  else return [];
  const links = check(await q) as { id: string; matter_id: string; role: string }[];
  if (!links.length) return [];
  const { data } = await db().from("matters").select("id, title, matter_number, status").eq("org_id", orgId).in("id", links.map((l) => l.matter_id));
  const ms = new Map(((data ?? []) as { id: string; title: string; matter_number: string | null; status: string }[]).map((m) => [m.id, m]));
  return links
    .filter((l) => ms.has(l.matter_id))
    .map((l) => ({ linkId: l.id, role: l.role, matterId: l.matter_id, title: ms.get(l.matter_id)!.title, number: ms.get(l.matter_id)!.matter_number, status: ms.get(l.matter_id)!.status }));
}

// Adds someone to a matter: an existing contact, an existing client, or a new
// contact made on the spot (name, person/company, email, phone).
export async function addMatterContact(
  orgId: string,
  userId: string,
  matterId: string,
  body: { contactId?: unknown; clientId?: unknown; role?: unknown; newContact?: { name?: unknown; kind?: unknown; email?: unknown; phone?: unknown; company?: unknown } }
) {
  const { data: matter } = await db().from("matters").select("id, client_id").eq("org_id", orgId).eq("id", matterId).maybeSingle();
  if (!matter) throw new MatterContactError("That matter wasn't found.", 404);
  const role = clip(body.role, 80);
  let contactId: string | null = isId(body.contactId) ? body.contactId : null;
  const clientId: string | null = !contactId && isId(body.clientId) ? body.clientId : null;

  if (!contactId && !clientId && body.newContact) {
    const name = clip(body.newContact.name, 200);
    if (!name) throw new MatterContactError("Type the new contact's name.");
    const email = clip(body.newContact.email, 320).toLowerCase();
    const created = check(
      await db()
        .from("contacts")
        .insert({
          org_id: orgId,
          kind: body.newContact.kind === "company" ? "company" : "person",
          name,
          role,
          company: clip(body.newContact.company, 200),
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
          phone: clip(body.newContact.phone, 60) || null,
          created_by: userId,
        })
        .select("id")
        .single()
    ) as { id: string };
    contactId = created.id;
  }
  if (!contactId && !clientId) throw new MatterContactError("Pick a contact or client, or add a new one.");

  if (contactId) {
    const ok = await db().from("contacts").select("id").eq("org_id", orgId).eq("id", contactId).maybeSingle();
    if (!ok.data) throw new MatterContactError("That contact wasn't found.", 404);
  } else {
    if ((matter as { client_id: string | null }).client_id === clientId) throw new MatterContactError("That's already this matter's client.");
    const ok = await db().from("clients").select("id").eq("org_id", orgId).eq("id", clientId!).maybeSingle();
    if (!ok.data) throw new MatterContactError("That client wasn't found.", 404);
  }

  const r = await db()
    .from("matter_contacts")
    .insert({ org_id: orgId, matter_id: matterId, contact_id: contactId, client_id: clientId, role, created_by: userId })
    .select("id, matter_id, contact_id, client_id, role")
    .single();
  if (r.error?.code === "23505") throw new MatterContactError("They're already on this matter.", 409);
  const row = check(r) as LinkRow;
  return (await describe(orgId, [row]))[0];
}

export async function updateMatterContactRole(orgId: string, linkId: string, role: unknown) {
  check(await db().from("matter_contacts").update({ role: clip(role, 80) }).eq("org_id", orgId).eq("id", linkId));
}

export async function removeMatterContact(orgId: string, linkId: string) {
  check(await db().from("matter_contacts").delete().eq("org_id", orgId).eq("id", linkId));
}
