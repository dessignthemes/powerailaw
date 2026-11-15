import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanDetails, layoutFor, type MatterDetails } from "@/lib/matters/details";

// Matter details ↔ Contacts (our client, the other side, vendors, opposing attorneys, who referred the client).
// The people and companies in a matter's Details (realtors, attorneys, title
// company, lender, the other side…) are looked up in Contacts first:
//   • found  → empty Details fields are filled from the contact card (email,
//              phone, firm), and the card gets anything it was missing;
//   • not found → a contact is created: the company (law firm, brokerage…)
//              as a Vendor, and the person under it ("Works at").
// Everyone is also put on the matter's Related contacts with their role.
// No AI is used here; it is plain database matching.

const db = () => createAdminClient();

type Pro = { kind: "pro"; prefix: string; vendorType: string; role: string };
type Company = { kind: "company"; key: string; vendorType: string; role: string };
type Party = { kind: "party"; prefix: "buyer" | "seller" | "other" | "client"; role: string };
type Group = Pro | Company | Party;

const GROUPS: Group[] = [
  { kind: "pro", prefix: "buyerAgent", vendorType: "Real estate agency", role: "Buyer's realtor" },
  { kind: "pro", prefix: "listingAgent", vendorType: "Real estate agency", role: "Listing agent" },
  { kind: "pro", prefix: "buyerAttorney", vendorType: "Law firm", role: "Buyer's attorney" },
  { kind: "pro", prefix: "sellerAttorney", vendorType: "Law firm", role: "Seller's attorney" },
  { kind: "pro", prefix: "otherAttorney", vendorType: "Law firm", role: "Other side's attorney" },
  // Who referred the client (the type comes from the Source field).
  { kind: "pro", prefix: "referral", vendorType: "", role: "Referred by" },
  { kind: "company", key: "titleCompany", vendorType: "Title company", role: "Title company" },
  { kind: "company", key: "lender", vendorType: "Lender / bank", role: "Lender" },
  { kind: "company", key: "inspector", vendorType: "Inspector", role: "Inspector" },
  { kind: "company", key: "surveyor", vendorType: "Surveyor", role: "Surveyor" },
  { kind: "company", key: "settlementAgent", vendorType: "Other vendor", role: "Settlement agent" },
  { kind: "party", prefix: "buyer", role: "Buyer" },
  { kind: "party", prefix: "seller", role: "Seller" },
  { kind: "party", prefix: "other", role: "Other party" },
  { kind: "party", prefix: "client", role: "Client" },
];

// "Realtor" → the company is a Real estate agency, and so on.
function referralVendorType(source: string) {
  const s = source.toLowerCase();
  if (/attorney|lawyer|law firm|counsel/.test(s)) return "Law firm";
  if (/realtor|real estate|broker|agent/.test(s)) return "Real estate agency";
  if (/lender|bank|mortgage|loan/.test(s)) return "Lender / bank";
  if (/title/.test(s)) return "Title company";
  if (/insur/.test(s)) return "Insurance company";
  if (/accountant|cpa/.test(s)) return "Accountant";
  return "";
}

const keysOf = (g: Group) =>
  g.kind === "pro"
    ? [`${g.prefix}Firm`, `${g.prefix}Name`, `${g.prefix}Email`, `${g.prefix}Phone`, ...(g.prefix === "referral" ? ["referralType"] : [])]
    : g.kind === "company"
      ? [g.key]
      : [`${g.prefix}Names`, `${g.prefix}Email`, `${g.prefix}Phone`, `${g.prefix}Address`];

// ── Name matching ────────────────────────────────────────────────────────────
// "Law Offices of Edward V. Murachanian, LLC" ≈ "law office of edward murachanian"
export function normCompany(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\boffices\b/g, "office")
    .replace(/\b(the|llc|l l c|inc|incorporated|corp|corporation|co|company|pc|p c|pa|p a|llp|ltd|esq|esquire)\b/g, " ")
    .replace(/\b[a-z]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// "Colleen Flynn Cyphers, Esq." ≈ "colleen flynn cyphers"; "Smith, John" ≈ "john smith"
export function normPerson(s: string) {
  let t = s.replace(/,?\s*(esq\.?|esquire|jr\.?|sr\.?|iii|ii)\s*$/i, "").trim();
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 2 && !/\s/.test(parts[0])) t = `${parts[1]} ${parts[0]}`; // "Last, First"
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(mr|mrs|ms|miss|dr|esq)\b/g, " ")
    .replace(/\b[a-z]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const longestWord = (n: string) => n.split(" ").filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0] ?? "";
const firstPhone = (c: ContactRow) => c.phone || c.mobile || c.work_phone || c.home_phone || null;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

type ContactRow = {
  id: string;
  kind: string;
  name: string;
  short_name?: string | null;
  email: string | null;
  phone: string | null;
  mobile?: string | null;
  work_phone?: string | null;
  home_phone?: string | null;
  address?: string | null;
  role?: string | null;
  company?: string | null;
  employer_id?: string | null;
};

async function findCompany(orgId: string, name: string): Promise<ContactRow | null> {
  const target = normCompany(name);
  const word = longestWord(target);
  if (!target || !word) return null;
  const { data } = await db().from("contacts").select("*").eq("org_id", orgId).neq("kind", "person").ilike("name", `%${word}%`).limit(200);
  const rows = (data ?? []) as ContactRow[];
  return rows.find((r) => normCompany(r.name) === target || (!!r.short_name && normCompany(r.short_name) === target)) ?? null;
}

async function findPerson(orgId: string, name: string, email: string | null, employerId: string | null): Promise<ContactRow | null> {
  if (email) {
    const { data } = await db().from("contacts").select("*").eq("org_id", orgId).eq("kind", "person").ilike("email", email).limit(5);
    const hit = (data ?? []) as ContactRow[];
    if (hit.length) return hit.find((r) => r.employer_id === employerId) ?? hit[0];
  }
  const target = normPerson(name);
  const word = longestWord(target);
  if (!target || !word) return null;
  const { data } = await db().from("contacts").select("*").eq("org_id", orgId).eq("kind", "person").ilike("name", `%${word}%`).limit(200);
  const same = ((data ?? []) as ContactRow[]).filter((r) => normPerson(r.name) === target);
  if (!same.length) return null;
  // Two people with the same name: the one at this company, or else only when there's just one.
  return same.find((r) => employerId && r.employer_id === employerId) ?? (same.length === 1 ? same[0] : null);
}

// Inserts a contact; before migration 0067 the newer columns are left out.
async function insertContact(orgId: string, userId: string | null, row: Record<string, unknown>): Promise<ContactRow | null> {
  const base = { org_id: orgId, created_by: userId, notes: "Added from a matter's details" };
  let r = await db().from("contacts").insert({ ...base, ...row }).select("*").single();
  if (r.error && /category|vendor_type|employer_id|42703|PGRST204/.test(`${r.error.code} ${r.error.message}`)) {
    const { name, kind, role, company, email, phone, address } = row as Record<string, unknown>;
    r = await db().from("contacts").insert({ ...base, name, kind, role: role ?? "", company: company ?? "", email: email ?? null, phone: phone ?? null, address: address ?? null }).select("*").single();
  }
  return r.error ? null : (r.data as ContactRow);
}

// Blanks on a contact card filled from the matter (never overwrites).
async function fillContact(orgId: string, c: ContactRow, v: { email?: string | null; phone?: string | null; address?: string | null; employerId?: string | null }) {
  const patch: Record<string, unknown> = {};
  if (v.email && !c.email) patch.email = v.email;
  if (v.phone && !firstPhone(c)) patch.phone = v.phone;
  if (v.address && !c.address) patch.address = v.address;
  if (v.employerId && !c.employer_id && c.kind === "person") patch.employer_id = v.employerId;
  if (!Object.keys(patch).length) return;
  const r = await db().from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id).eq("org_id", orgId);
  if (r.error && patch.employer_id) {
    delete patch.employer_id; // 0067 not run yet
    if (Object.keys(patch).length) await db().from("contacts").update(patch).eq("id", c.id).eq("org_id", orgId);
  }
}

async function linkToMatter(orgId: string, userId: string | null, matterId: string, contactId: string, role: string) {
  const { data } = await db().from("matter_contacts").select("id").eq("org_id", orgId).eq("matter_id", matterId).eq("contact_id", contactId).limit(1);
  if (data?.length) return false;
  const r = await db().from("matter_contacts").insert({ org_id: orgId, matter_id: matterId, contact_id: contactId, role, created_by: userId });
  return !r.error;
}

// A client record (Clients / Client Intake) with this name.
async function isClientRecord(orgId: string, name: string) {
  const target = normPerson(name);
  const word = longestWord(target);
  if (!word) return false;
  const { data } = await db().from("clients").select("name").eq("org_id", orgId).ilike("name", `%${word}%`).limit(100);
  return ((data ?? []) as { name: string }[]).some((c) => normPerson(c.name) === target || normCompany(c.name) === normCompany(name));
}

// "Mr. Joseph Zambardi & Mrs. Brenna Zambardi" ≈ "Joseph Zambardi, Brenna Zambardi": the same set of name words.
function nameWords(s: string): string {
  return [
    ...new Set(
      normPerson(s.replace(/&|\band\b|,|;/gi, " "))
        .split(" ")
        .filter((w) => w.length >= 2 && w !== "and")
    ),
  ]
    .sort()
    .join(" ");
}

// The matter's client from its Details: an existing client card with the same
// name(s); else a contact card with the same name(s) becomes a client card; else
// a new client card from the Details. Only when the matter has no client yet.
// Returns "matched" (already the matter's client), "linked" (set on the matter),
// "created" (new client card), or null when the matter already has another client.
async function assignClient(
  orgId: string,
  matterId: string,
  names: string,
  v: { email: string | null; phone: string | null; address: string | null; kind: string }
): Promise<"matched" | "linked" | "created" | null> {
  const key = nameWords(names);
  if (!key) return null;
  const { data: m } = await db().from("matters").select("client_id").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  const current = (m as { client_id?: string | null } | null)?.client_id ?? null;
  const word = key.split(" ").sort((a, b) => b.length - a.length)[0];
  const { data: cl } = await db().from("clients").select("id, name").eq("org_id", orgId).ilike("name", `%${word}%`).limit(200);
  const clients = ((cl ?? []) as { id: string; name: string }[]).filter((c) => nameWords(c.name) === key);
  if (current) return clients.some((c) => c.id === current) ? "matched" : null; // never replace a client someone chose
  const set = async (clientId: string) => {
    await db().from("matters").update({ client_id: clientId }).eq("id", matterId).eq("org_id", orgId);
  };
  if (clients.length === 1) {
    await set(clients[0].id);
    return "linked";
  }
  if (clients.length > 1) {
    // Two client cards with the same name: the one with the same email, else let a person pick.
    const { data: rows } = await db().from("clients").select("id, email").in("id", clients.map((c) => c.id));
    const same = v.email ? ((rows ?? []) as { id: string; email: string | null }[]).filter((r) => (r.email ?? "").toLowerCase() === v.email!.toLowerCase()) : [];
    if (same.length !== 1) return null;
    await set(same[0].id);
    return "linked";
  }
  // A contact card with the same name(s) (e.g. from the Cards import) → a client card from it.
  const { data: ct } = await db().from("contacts").select("*").eq("org_id", orgId).ilike("name", `%${word}%`).limit(200);
  const contacts = ((ct ?? []) as (ContactRow & { category?: string | null; created_at?: string })[]).filter((c) => nameWords(c.name) === key);
  // Several cards with the same name (e.g. one from the Cards import and one made from these
  // Details): the one with the same email, else the one on this matter, else a Client card.
  let from: ContactRow | null = contacts.length === 1 ? contacts[0] : null;
  if (contacts.length > 1) {
    const byEmail = v.email ? contacts.filter((c) => (c.email ?? "").toLowerCase() === v.email!.toLowerCase()) : [];
    const { data: onMatter } = await db().from("matter_contacts").select("contact_id").eq("org_id", orgId).eq("matter_id", matterId);
    const linkedIds = new Set(((onMatter ?? []) as { contact_id: string | null }[]).map((r) => r.contact_id));
    from =
      byEmail[0] ??
      contacts.find((c) => linkedIds.has(c.id)) ??
      contacts.find((c) => c.category === "client") ??
      [...contacts].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
  }
  const type = (from ? from.kind : v.kind) === "person" ? "Individual" : "Legal entity";
  const { data: made, error } = await db()
    .from("clients")
    .insert({
      id: crypto.randomUUID(),
      org_id: orgId,
      name: from?.name ?? names.trim().slice(0, 200),
      description: from ? "Made from the contact card when the matter's details were filled in." : "Added from the matter's details.",
      status: "Active",
      type,
      email: from?.email || v.email,
      phone: (from ? firstPhone(from) : null) || v.phone,
      address: from?.address || v.address,
    })
    .select("id")
    .single();
  if (error || !made) return null;
  await set((made as { id: string }).id);
  return "created";
}

const partyKind = (name: string) =>
  /^estate of\b|\bestate$/i.test(name) ? "estate" : /\btrust\b/i.test(name) ? "trust" : /\b(llc|inc|corp|corporation|company|l\.?p\.?|bank|association)\b/i.test(name) ? "company" : "person";

export type SyncResult = { created: number; matched: number; linked: number; filled: number; people: number }; // people = names/companies found in Details

// keys: only the groups these Details fields belong to (all groups when left out).
export async function syncDetailsWithContacts(orgId: string, userId: string | null, matterId: string, keys?: string[]): Promise<SyncResult> {
  const res: SyncResult = { created: 0, matched: 0, linked: 0, filled: 0, people: 0 };
  const { data: m } = await db().from("matters").select("*").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  const matter = m as { details?: unknown; matter_code?: string | null; category?: string | null } | null;
  if (!matter || !("details" in matter)) return res;
  const details = cleanDetails(matter.details);
  const { side } = layoutFor({ matterCode: matter.matter_code, category: matter.category });
  // Our own client is in Clients already; the other side goes to Contacts.
  const ourParty = side ?? "client";
  const fills: MatterDetails = {};
  const val = (k: string) => details[k]?.value?.trim() ?? "";
  const fill = (k: string, v: string | null | undefined) => {
    if (v && v.trim() && !val(k) && !fills[k]) fills[k] = { value: v.trim(), source: "Contacts" };
  };

  const groups = GROUPS.filter((g) => !keys || keysOf(g).some((k) => keys.includes(k)));
  for (const g of groups) {
    try {
      if (g.kind === "pro") {
        const vendorType = g.prefix === "referral" ? referralVendorType(val("referralType")) : g.vendorType;
        // A referral from a past client or a friend isn't a vendor.
        const category = vendorType ? "vendor" : "other";
        const firmName = val(`${g.prefix}Firm`);
        const personName = val(`${g.prefix}Name`);
        const email = val(`${g.prefix}Email`).toLowerCase();
        const phone = val(`${g.prefix}Phone`);
        if (!firmName && !personName) continue;
        res.people++;
        let company = firmName ? await findCompany(orgId, firmName) : null;
        if (company) res.matched++;
        else if (firmName) {
          company = await insertContact(orgId, userId, { kind: "company", name: firmName, category, vendor_type: vendorType });
          if (company) res.created++;
        }
        let person: ContactRow | null = null;
        if (personName) {
          person = await findPerson(orgId, personName, isEmail(email) ? email : null, company?.id ?? null);
          if (person) {
            res.matched++;
            await fillContact(orgId, person, { email: isEmail(email) ? email : null, phone: phone || null, employerId: company?.id ?? null });
          } else {
            person = await insertContact(orgId, userId, {
              kind: "person",
              name: personName,
              role: g.role,
              company: firmName,
              email: isEmail(email) ? email : null,
              phone: phone || null,
              category,
              vendor_type: vendorType,
              employer_id: company?.id ?? null,
            });
            if (person) res.created++;
          }
        }
        // Blanks in Details from the contact cards.
        if (person) {
          fill(`${g.prefix}Email`, person.email);
          fill(`${g.prefix}Phone`, firstPhone(person));
          if (!firmName && person.employer_id) {
            const { data: emp } = await db().from("contacts").select("name").eq("id", person.employer_id).eq("org_id", orgId).maybeSingle();
            fill(`${g.prefix}Firm`, (emp as { name?: string } | null)?.name ?? person.company ?? null);
          } else if (!firmName) fill(`${g.prefix}Firm`, person.company ?? null);
        }
        const link = person ?? company;
        if (link && (await linkToMatter(orgId, userId, matterId, link.id, g.role))) res.linked++;
      } else if (g.kind === "company") {
        const name = val(g.key);
        if (!name) continue;
        res.people++;
        let company = await findCompany(orgId, name);
        if (company) res.matched++;
        else {
          company = await insertContact(orgId, userId, { kind: "company", name, category: "vendor", vendor_type: g.vendorType });
          if (company) res.created++;
        }
        if (company && (await linkToMatter(orgId, userId, matterId, company.id, g.role))) res.linked++;
      } else {
        // Our own client goes to Contacts as a Client (checked for conflicts); the other side as Other.
        const ours = g.prefix === ourParty;
        if (g.prefix === "client" && ourParty !== "client") continue;
        const role = ours && g.prefix !== "client" ? `${g.role} (our client)` : g.role;
        const all = val(`${g.prefix}Names`);
        // "Robert Klag, Alex Quinonez" → two people; "Smith and Sons LLC" stays one company.
        const names = (partyKind(all) === "person" ? all.split(/,|;|\band\b|&/i) : [all]).map((x) => x.trim()).filter((x) => x.length > 1);
        if (!names.length) continue;
        res.people += names.length;
        const one = names.length === 1;
        const email = val(`${g.prefix}Email`).toLowerCase();
        const phone = val(`${g.prefix}Phone`);
        const address = val(`${g.prefix}Address`);
        // Our client: the matter's Client (at the top, next to Status) is set to the
        // matching client card, made from a matching contact card if needed.
        if (ours) {
          const done = await assignClient(orgId, matterId, all, { email: isEmail(email) ? email : null, phone: phone || null, address: address || null, kind: partyKind(all) });
          if (done) {
            if (done === "created") res.created++;
            else res.matched++;
            res.linked += done === "linked" || done === "created" ? 1 : 0;
            continue;
          }
        }
        for (const name of names.slice(0, 6)) {
          const kind = partyKind(name);
          // Our client may already be a client record (Client Intake): use that, don't add a second card.
          if (ours && (await isClientRecord(orgId, name))) {
            res.matched++;
            continue;
          }
          let c = kind === "person" ? await findPerson(orgId, name, one && isEmail(email) ? email : null, null) : await findCompany(orgId, name);
          if (c) {
            res.matched++;
            if (one) await fillContact(orgId, c, { email: isEmail(email) ? email : null, phone: phone || null, address: address || null });
          } else {
            c = await insertContact(orgId, userId, {
              kind,
              name,
              role,
              email: one && isEmail(email) ? email : null,
              phone: one ? phone || null : null,
              address: address || null,
              category: ours ? "client" : "other",
            });
            if (c) res.created++;
          }
          if (c && one) {
            fill(`${g.prefix}Email`, c.email);
            fill(`${g.prefix}Phone`, firstPhone(c));
            fill(`${g.prefix}Address`, c.address ?? null);
          }
          if (c && (await linkToMatter(orgId, userId, matterId, c.id, role))) res.linked++;
        }
      }
    } catch (e) {
      console.error(`Details → Contacts (${g.kind === "company" ? g.key : g.prefix}) failed:`, e);
    }
  }

  // Save what was filled from Contacts (only into fields that are still empty).
  if (Object.keys(fills).length) {
    const { data: again } = await db().from("matters").select("details").eq("id", matterId).eq("org_id", orgId).maybeSingle();
    const now = cleanDetails((again as { details?: unknown } | null)?.details);
    for (const [k, v] of Object.entries(fills)) {
      if (now[k]) continue;
      now[k] = v;
      res.filled++;
    }
    if (res.filled) await db().from("matters").update({ details: now }).eq("id", matterId).eq("org_id", orgId);
  }
  return res;
}

// The matter's client from its Details, when it has none yet (no AI; runs when the
// matter's Details are opened, so older matters get theirs too). True when set.
export async function ensureClient(orgId: string, matterId: string): Promise<boolean> {
  const { data: m } = await db().from("matters").select("*").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  const matter = m as { client_id?: string | null; details?: unknown; matter_code?: string | null; category?: string | null } | null;
  if (!matter || matter.client_id || !("details" in matter)) return false;
  const details = cleanDetails(matter.details);
  const { side } = layoutFor({ matterCode: matter.matter_code, category: matter.category });
  const prefix = side ?? "client";
  const names = details[`${prefix}Names`]?.value?.trim();
  if (!names) return false;
  const email = details[`${prefix}Email`]?.value?.trim() ?? "";
  const done = await assignClient(orgId, matterId, names, {
    email: isEmail(email) ? email.toLowerCase() : null,
    phone: details[`${prefix}Phone`]?.value?.trim() || null,
    address: details[`${prefix}Address`]?.value?.trim() || null,
    kind: partyKind(names),
  });
  return done === "linked" || done === "created";
}
