import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, MailError } from "@/lib/mail/tokens";
import { getUserConnections } from "@/lib/data/oauth";
import type { ImportedContact } from "@/lib/contacts/importParse";

// Bringing contacts in from files (iPhone / iCloud vCard, RingCentral or any CSV)
// and from Outlook. Contacts belong to the firm, like the rest of Contacts.
// Nothing is ever sent back to or deleted from Outlook or the phone.

export class ContactImportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const db = () => createAdminClient();
const MAX_IMPORT = 5000;
const MIGRATION = "0045_contacts_import.sql";

function missingColumns(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "42703" || e.code === "PGRST204" || e.code === "42P01" || e.code === "PGRST205" || /source|external_id|imported_by|contact_syncs/.test(e.message ?? ""));
}
const setup = () =>
  new ContactImportError(`Importing contacts needs a database update. Run supabase/migrations/${MIGRATION} in the Supabase SQL editor, then try again.`, 503, "setup_required");

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const keyOf = (c: { name: string; email: string | null; phone: string | null }) =>
  c.email ? `e:${c.email.toLowerCase()}` : `n:${c.name.toLowerCase()}|${(c.phone ?? "").replace(/\D/g, "")}`;

// Re-checks what the browser read from the file.
function clean(list: unknown): ImportedContact[] {
  if (!Array.isArray(list)) throw new ContactImportError("No contacts were found in the file.");
  if (list.length > MAX_IMPORT) throw new ContactImportError(`That's more than ${MAX_IMPORT.toLocaleString()} contacts. Please split the file and import it in parts.`);
  const out: ImportedContact[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const name = clip(raw?.name, 200);
    if (!name) continue;
    const email = clip(raw.email, 320).toLowerCase();
    out.push({
      kind: raw.kind === "company" ? "company" : "person",
      name,
      company: clip(raw.company, 200),
      role: clip(raw.role, 100),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: clip(raw.phone, 60) || null,
      address: clip(raw.address, 500) || null,
      notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 5000) : "",
    });
  }
  return out;
}

// Keys of contacts the firm already has (same email, or same name + phone).
async function existingKeys(orgId: string) {
  const { data, error } = await db().from("contacts").select("name, email, phone").eq("org_id", orgId).limit(50000);
  if (error) throw error;
  return new Set(((data ?? []) as { name: string; email: string | null; phone: string | null }[]).map(keyOf));
}

const toRow = (c: ImportedContact) => ({
  kind: c.kind,
  name: c.name,
  role: c.role,
  company: c.company,
  email: c.email,
  phone: c.phone,
  address: c.address,
  notes: c.notes,
});

// From a file. Contacts the firm already has are skipped, so importing the same file twice is safe.
export async function importContactFile(orgId: string, userId: string, source: "vcard" | "csv", list: unknown) {
  const contacts = clean(list);
  if (!contacts.length) throw new ContactImportError("No contacts with a name were found in the file.");
  const have = await existingKeys(orgId);
  const fresh: ImportedContact[] = [];
  for (const c of contacts) {
    const k = keyOf(c);
    if (have.has(k)) continue;
    have.add(k);
    fresh.push(c);
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await db()
      .from("contacts")
      .insert(fresh.slice(i, i + 500).map((c) => ({ ...toRow(c), org_id: orgId, created_by: userId, imported_by: userId, source })));
    if (error) {
      if (missingColumns(error)) throw setup();
      throw error;
    }
  }
  return { added: fresh.length, skipped: contacts.length - fresh.length };
}

// ── Outlook ────────────────────────────────────────────────────────────────

type GraphContact = {
  id: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  emailAddresses?: { address?: string | null }[];
  mobilePhone?: string | null;
  businessPhones?: string[];
  homePhones?: string[];
  businessAddress?: { street?: string; city?: string; state?: string; postalCode?: string; countryOrRegion?: string } | null;
  homeAddress?: { street?: string; city?: string; state?: string; postalCode?: string; countryOrRegion?: string } | null;
  personalNotes?: string | null;
};

const SELECT = "id,displayName,givenName,surname,companyName,jobTitle,emailAddresses,mobilePhone,businessPhones,homePhones,businessAddress,homeAddress,personalNotes";

function fromGraph(g: GraphContact): ImportedContact | null {
  const personName = clip(g.displayName || [g.givenName, g.surname].filter(Boolean).join(" "), 200);
  const company = clip(g.companyName, 200);
  const isCompany = !clip(g.givenName, 200) && !clip(g.surname, 200) && !!company && (!personName || personName.toLowerCase() === company.toLowerCase());
  const name = isCompany ? company : personName || company;
  if (!name) return null;
  const a = g.businessAddress && Object.values(g.businessAddress).some(Boolean) ? g.businessAddress : g.homeAddress;
  const address = a ? [a.street, a.city, [a.state, a.postalCode].filter(Boolean).join(" "), a.countryOrRegion].filter((x) => x && String(x).trim()).join(", ") : "";
  const email = clip(g.emailAddresses?.find((e) => e.address)?.address, 320).toLowerCase();
  return {
    kind: isCompany ? "company" : "person",
    name,
    company: isCompany ? "" : company,
    role: clip(g.jobTitle, 100),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: clip(g.mobilePhone || g.businessPhones?.[0] || g.homePhones?.[0], 60) || null,
    address: clip(address, 500) || null,
    notes: (g.personalNotes ?? "").trim().slice(0, 5000),
  };
}

export const hasContactsScope = (scopes: string[]) => scopes.some((s) => /(^|\/)Contacts\.Read(Write)?$/i.test(s));

async function graphGet<T>(token: string, url: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(url.startsWith("http") ? url : `https://graph.microsoft.com/v1.0${url}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()) as T };
}

// Status for the Contacts page: is Outlook connected with contacts permission, is sync on.
export async function outlookContactsStatus(userId: string) {
  const conns = await getUserConnections(userId).catch(() => []);
  const ms = conns.find((c) => c.provider === "microsoft");
  const { data, error } = await db().from("contact_syncs").select("enabled, last_synced_at, last_added").eq("user_id", userId).eq("provider", "microsoft").maybeSingle();
  const row = error ? null : (data as { enabled: boolean; last_synced_at: string | null; last_added: number } | null);
  return {
    connected: !!ms,
    email: ms?.account_email ?? null,
    permission: !!ms && hasContactsScope(ms.scopes ?? []),
    syncing: !!row?.enabled,
    lastSyncedAt: row?.last_synced_at ?? null,
    setupRequired: !!error && missingColumns(error),
  };
}

// Reads the person's Outlook contacts (only the ones changed since the last
// sync, after the first time) and adds new ones / updates ones that came from Outlook.
export async function syncOutlookContacts(orgId: string, userId: string, opts: { keepSyncing?: boolean } = {}) {
  const conns = await getUserConnections(userId);
  const ms = conns.find((c) => c.provider === "microsoft");
  if (!ms) throw new ContactImportError("Connect Outlook first (Integrations → Outlook).", 400, "not_connected");
  if (!hasContactsScope(ms.scopes ?? [])) {
    throw new ContactImportError("Reconnect Outlook once and allow Contacts, so LawPower can read your Outlook contacts.", 400, "needs_permission");
  }
  let token: string;
  try {
    ({ token } = await getAccessToken(userId, "microsoft"));
  } catch (e) {
    if (e instanceof MailError) throw new ContactImportError(e.message, 400, "reconnect");
    throw e;
  }

  const { data: syncRow, error: syncErr } = await db().from("contact_syncs").select("last_synced_at").eq("user_id", userId).eq("provider", "microsoft").maybeSingle();
  if (syncErr && missingColumns(syncErr)) throw setup();
  const since = (syncRow as { last_synced_at?: string | null } | null)?.last_synced_at ?? null;
  const startedAt = new Date();

  // Page through (up to 10,000 contacts); after the first sync only what changed.
  const base = new URLSearchParams({ $select: SELECT, $top: "500" });
  if (since) base.set("$filter", `lastModifiedDateTime ge ${new Date(new Date(since).getTime() - 5 * 60_000).toISOString()}`);
  let url: string | undefined = `/me/contacts?${base}`;
  const found: { id: string; c: ImportedContact }[] = [];
  for (let page = 0; url && page < 20; page++) {
    let r: Awaited<ReturnType<typeof graphGet<{ value: GraphContact[]; "@odata.nextLink"?: string }>>> = await graphGet<{ value: GraphContact[]; "@odata.nextLink"?: string }>(token, url);
    if (!r.ok && r.status === 400 && since && page === 0) {
      // Filter not accepted: read everything instead.
      base.delete("$filter");
      r = await graphGet(token, `/me/contacts?${base}`);
    }
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new ContactImportError("Reconnect Outlook once and allow Contacts, so LawPower can read your Outlook contacts.", 400, "needs_permission");
      throw new ContactImportError("Outlook didn't send the contacts. Please try again.", 502);
    }
    for (const g of r.data.value ?? []) {
      const c = fromGraph(g);
      if (c) found.push({ id: g.id, c });
    }
    url = r.data["@odata.nextLink"];
  }

  // Contacts already brought in from Outlook are updated; others are added
  // unless the firm already has them (same email, or same name + phone).
  const ids = found.map((f) => f.id);
  const known = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from("contacts").select("id, external_id").eq("org_id", orgId).eq("source", "outlook").in("external_id", ids.slice(i, i + 200));
    if (error) {
      if (missingColumns(error)) throw setup();
      throw error;
    }
    for (const r of (data ?? []) as { id: string; external_id: string }[]) known.set(r.external_id, r.id);
  }
  const have = await existingKeys(orgId);
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  for (const f of found) {
    const existingId = known.get(f.id);
    if (existingId) {
      const { error } = await db().from("contacts").update({ ...toRow(f.c), updated_at: new Date().toISOString() }).eq("id", existingId).eq("org_id", orgId);
      if (!error) updated++;
      continue;
    }
    const k = keyOf(f.c);
    if (have.has(k)) continue;
    have.add(k);
    inserts.push({ ...toRow(f.c), org_id: orgId, created_by: userId, imported_by: userId, source: "outlook", external_id: f.id });
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db().from("contacts").insert(inserts.slice(i, i + 500));
    if (error) {
      if (missingColumns(error)) throw setup();
      throw error;
    }
  }

  const keep = opts.keepSyncing;
  await db()
    .from("contact_syncs")
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        provider: "microsoft",
        ...(keep === undefined ? {} : { enabled: keep }),
        last_synced_at: startedAt.toISOString(),
        last_added: inserts.length,
      },
      { onConflict: "user_id,provider" }
    );
  return { added: inserts.length, updated, read: found.length };
}

export async function setOutlookSync(orgId: string, userId: string, enabled: boolean) {
  const { error } = await db().from("contact_syncs").upsert({ user_id: userId, org_id: orgId, provider: "microsoft", enabled }, { onConflict: "user_id,provider" });
  if (error) {
    if (missingColumns(error)) throw setup();
    throw error;
  }
}

// Everyone who turned on "keep in step" (for the daily background run).
export async function syncAllOutlookContacts() {
  const { data } = await db().from("contact_syncs").select("user_id, org_id").eq("provider", "microsoft").eq("enabled", true).limit(500);
  let ok = 0;
  for (const r of (data ?? []) as { user_id: string; org_id: string }[]) {
    try {
      await syncOutlookContacts(r.org_id, r.user_id);
      ok++;
    } catch (e) {
      console.error("Outlook contact sync failed for one person:", (e as Error).message);
    }
  }
  return { ok, total: data?.length ?? 0 };
}
