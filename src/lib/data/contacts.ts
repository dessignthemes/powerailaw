import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { getSessionUser } from "@/lib/auth";
import { CONTACTS_MIGRATION, CONTACT_TYPES_MIGRATION, type Contact, type ContactInput } from "@/lib/records/contactTypes";

export class ContactsSetupError extends Error {
  constructor() {
    super(`People and companies need a database update. Run supabase/migrations/${CONTACTS_MIGRATION} in the Supabase SQL editor, then refresh.`);
  }
}

export class ContactInputError extends Error {}

type Row = {
  id: string;
  kind: Contact["kind"];
  name: string;
  role: string;
  company: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string;
  client_id: string | null;
  matter_id: string | null;
  category?: string | null;
  vendor_type?: string | null;
  employer_id?: string | null;
  short_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  mobile?: string | null;
  work_phone?: string | null;
  home_phone?: string | null;
  fax?: string | null;
  created_at: string;
  updated_at: string;
};

const toContact = (r: Row): Contact => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  role: r.role ?? "",
  company: r.company ?? "",
  email: r.email,
  phone: r.phone,
  address: r.address,
  notes: r.notes ?? "",
  clientId: r.client_id,
  matterId: r.matter_id,
  category: (["client", "vendor", "other"].includes(r.category ?? "") ? r.category : "") as Contact["category"],
  vendorType: r.vendor_type ?? "",
  employerId: r.employer_id ?? null,
  shortName: r.short_name ?? "",
  city: r.city ?? null,
  state: r.state ?? null,
  zip: r.zip ?? null,
  mobile: r.mobile ?? null,
  workPhone: r.work_phone ?? null,
  homePhone: r.home_phone ?? null,
  fax: r.fax ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function isMissingTable(error: unknown) {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "PGRST205" || e?.code === "42P01" || /could not find the table.*contacts|relation "?contacts"? does not exist/i.test(e?.message ?? "");
}

const optText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const schema = z.object({
  kind: z.enum(["person", "company", "trust", "estate"]),
  name: z.string().trim().min(1, "Enter a name.").max(200),
  role: z.string().trim().max(100).default(""),
  company: z.string().trim().max(200).default(""),
  email: optText(320),
  phone: optText(60),
  address: optText(500),
  notes: z.string().max(5000).default(""),
  clientId: z.string().uuid().nullable().optional().default(null),
  matterId: z.string().uuid().nullable().optional().default(null),
  // Added in 0067 (left out = unchanged).
  category: z.enum(["", "client", "vendor", "other"]).optional(),
  vendorType: z.string().trim().max(60).optional(),
  employerId: z.string().uuid().nullable().optional(),
  shortName: z.string().trim().max(200).optional(),
  city: optText(100),
  state: optText(40),
  zip: optText(20),
  mobile: optText(60),
  workPhone: optText(60),
  homePhone: optText(60),
  fax: optText(60),
});

// Is this a "the 0067 columns aren't there yet" error?
function missingNewColumns(e: unknown) {
  const x = e as { code?: string; message?: string } | null;
  return (
    !!x &&
    (x.code === "42703" || x.code === "PGRST204" || x.code === "23514" ||
      /category|vendor_type|employer_id|short_name|work_phone|home_phone|contacts_kind_check/.test(x.message ?? ""))
  );
}
export class ContactTypesSetupError extends Error {
  constructor() {
    super(`Trusts, estates, Client/Vendor and "works at" need a database update. Run supabase/migrations/${CONTACT_TYPES_MIGRATION} in the Supabase SQL editor, then try again.`);
  }
}

function parse(input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) throw new ContactInputError(res.error.issues[0]?.message ?? "Please check the details.");
  const v = res.data;
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new ContactInputError("That email address doesn't look right.");
  return v;
}

// Linked client and matter must be in the same workspace.
async function checkLinks(orgId: string, v: { clientId: string | null; matterId: string | null }) {
  const s = createAdminClient();
  if (v.clientId) {
    const { data } = await s.from("clients").select("id").eq("id", v.clientId).eq("org_id", orgId).maybeSingle();
    if (!data) throw new ContactInputError("That client wasn't found.");
  }
  if (v.matterId) {
    const { data } = await s.from("matters").select("id").eq("id", v.matterId).eq("org_id", orgId).maybeSingle();
    if (!data) throw new ContactInputError("That matter wasn't found.");
  }
}

const toRow = (v: ReturnType<typeof parse>) => {
  const row: Record<string, unknown> = {
    kind: v.kind,
    name: v.name,
    role: v.role,
    company: v.kind === "person" ? v.company : "",
    email: v.email,
    phone: v.phone,
    address: v.address,
    notes: v.notes,
    client_id: v.clientId,
    matter_id: v.matterId,
  };
  // Only send the newer fields when the form sent them (older forms keep what's saved).
  const extra: [string, unknown][] = [
    ["category", v.category],
    ["vendor_type", v.vendorType],
    ["employer_id", v.kind === "person" ? v.employerId : v.employerId === undefined ? undefined : null],
    ["short_name", v.shortName],
    ["city", v.city],
    ["state", v.state],
    ["zip", v.zip],
    ["mobile", v.mobile],
    ["work_phone", v.workPhone],
    ["home_phone", v.homePhone],
    ["fax", v.fax],
  ];
  const sent = (k: string) => k in (v as Record<string, unknown>) && (v as Record<string, unknown>)[k] !== undefined;
  const keyFor: Record<string, string> = { category: "category", vendor_type: "vendorType", employer_id: "employerId", short_name: "shortName", city: "city", state: "state", zip: "zip", mobile: "mobile", work_phone: "workPhone", home_phone: "homePhone", fax: "fax" };
  for (const [col, val] of extra) if (sent(keyFor[col]) && val !== undefined) row[col] = val;
  return row;
};
const baseOnly = (row: Record<string, unknown>) => {
  const { kind, name, role, company, email, phone, address, notes, client_id, matter_id } = row;
  return { kind, name, role, company, email, phone, address, notes, client_id, matter_id };
};

// Employer must be a company in the same workspace.
async function checkEmployer(orgId: string, employerId: string | null | undefined) {
  if (!employerId) return;
  const { data } = await createAdminClient().from("contacts").select("id, kind").eq("id", employerId).eq("org_id", orgId).maybeSingle();
  if (!data || (data as { kind: string }).kind !== "company") throw new ContactInputError("Pick a company for “Works at”.");
}

// Returns setupRequired instead of failing, so Records still shows clients
// and matters before the migration is run.
export async function listContacts(): Promise<{ contacts: Contact[]; setupRequired: boolean }> {
  const orgId = await getCurrentOrgId();
  // The database hands back 1,000 rows at a time, so read in pages (firms import thousands of cards).
  const all: Row[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await createAdminClient()
      .from("contacts")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) {
      if (isMissingTable(error)) return { contacts: [], setupRequired: true };
      throw error;
    }
    all.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return { contacts: all.map(toContact), setupRequired: false };
}

export async function createContact(input: ContactInput | unknown): Promise<Contact> {
  const orgId = await getCurrentOrgId();
  const user = await getSessionUser();
  const v = parse(input);
  await checkLinks(orgId, v);
  await checkEmployer(orgId, v.employerId);
  const row = toRow(v);
  let { data, error } = await createAdminClient()
    .from("contacts")
    .insert({ ...row, org_id: orgId, created_by: user?.id ?? null })
    .select("*")
    .single();
  if (error && missingNewColumns(error)) {
    if (v.kind === "trust" || v.kind === "estate" || v.category || v.employerId) throw new ContactTypesSetupError();
    ({ data, error } = await createAdminClient().from("contacts").insert({ ...baseOnly(row), org_id: orgId, created_by: user?.id ?? null }).select("*").single());
  }
  if (error) {
    if (isMissingTable(error)) throw new ContactsSetupError();
    throw error;
  }
  const created = toContact(data as Row);
  // A matter picked when creating the contact: also put them on that matter's
  // Contacts card (skipped quietly before migration 0047).
  if (created.matterId) {
    await createAdminClient()
      .from("matter_contacts")
      .insert({ org_id: orgId, matter_id: created.matterId, contact_id: created.id, role: created.role ?? "", created_by: user?.id ?? null })
      .then(() => undefined, () => undefined);
  }
  return created;
}

export async function updateContact(id: string, input: unknown): Promise<Contact> {
  const orgId = await getCurrentOrgId();
  const v = parse(input);
  await checkLinks(orgId, v);
  await checkEmployer(orgId, v.employerId);
  if (v.employerId && v.employerId === id) throw new ContactInputError("A contact can't work at itself.");
  const row = toRow(v);
  let { data, error } = await createAdminClient()
    .from("contacts")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle();
  if (error && missingNewColumns(error)) {
    if (v.kind === "trust" || v.kind === "estate" || v.category || v.employerId) throw new ContactTypesSetupError();
    ({ data, error } = await createAdminClient().from("contacts").update({ ...baseOnly(row), updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId).select("*").maybeSingle());
  }
  if (error) {
    if (isMissingTable(error)) throw new ContactsSetupError();
    throw error;
  }
  if (!data) throw new ContactInputError("That contact wasn't found. It may have been deleted.");
  return toContact(data as Row);
}

export async function deleteContact(id: string) {
  const orgId = await getCurrentOrgId();
  const { error } = await createAdminClient().from("contacts").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    if (isMissingTable(error)) throw new ContactsSetupError();
    throw error;
  }
}
