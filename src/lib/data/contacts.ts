import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { getSessionUser } from "@/lib/auth";
import { CONTACTS_MIGRATION, type Contact, type ContactInput } from "@/lib/records/contactTypes";

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
  kind: z.enum(["person", "company"]),
  name: z.string().trim().min(1, "Enter a name.").max(200),
  role: z.string().trim().max(100).default(""),
  company: z.string().trim().max(200).default(""),
  email: optText(320),
  phone: optText(60),
  address: optText(500),
  notes: z.string().max(5000).default(""),
  clientId: z.string().uuid().nullable().optional().default(null),
  matterId: z.string().uuid().nullable().optional().default(null),
});

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

const toRow = (v: ReturnType<typeof parse>) => ({
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
});

// Returns setupRequired instead of failing, so Records still shows clients
// and matters before the migration is run.
export async function listContacts(): Promise<{ contacts: Contact[]; setupRequired: boolean }> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient()
    .from("contacts")
    .select("*")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return { contacts: [], setupRequired: true };
    throw error;
  }
  return { contacts: (data as Row[]).map(toContact), setupRequired: false };
}

export async function createContact(input: ContactInput | unknown): Promise<Contact> {
  const orgId = await getCurrentOrgId();
  const user = await getSessionUser();
  const v = parse(input);
  await checkLinks(orgId, v);
  const { data, error } = await createAdminClient()
    .from("contacts")
    .insert({ ...toRow(v), org_id: orgId, created_by: user?.id ?? null })
    .select("*")
    .single();
  if (error) {
    if (isMissingTable(error)) throw new ContactsSetupError();
    throw error;
  }
  return toContact(data as Row);
}

export async function updateContact(id: string, input: unknown): Promise<Contact> {
  const orgId = await getCurrentOrgId();
  const v = parse(input);
  await checkLinks(orgId, v);
  const { data, error } = await createAdminClient()
    .from("contacts")
    .update({ ...toRow(v), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new ContactsSetupError();
    throw error;
  }
  if (!data) throw new ContactInputError("That record wasn't found. It may have been deleted.");
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
