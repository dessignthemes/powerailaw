import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { requireUserOrg } from "@/lib/data/documents";
import { templatesAllowed } from "@/lib/clients/templates";
import { categoryForCode, type LeapRow, type FieldTarget } from "@/lib/matters/leapImport";
import { emptyProfile, newPerson, normalizeProfile, coreFields, TITLES, type CardType, type Profile, type Person, type ContactLine, type ContactKind } from "@/lib/clients/card";

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

// ── Client cards from LEAP names ("Mr. Jason Szczypinski", "Ms. A & Mr. B") ──
const COMPANY = /\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Company|Co\.|Trust|Estate of|LP|LLP|Group|Holdings|Partners|Properties|Realty|Bank)\b/i;
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|esq\.?)$/i;

function parsePerson(raw: string): Partial<Person> {
  let words = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let title = "";
  const t = TITLES.find((x) => x && words[0] && words[0].replace(/\.$/, "").toLowerCase() === x.replace(/\.$/, "").toLowerCase());
  if (t) {
    title = t;
    words = words.slice(1);
  }
  let suffix = "";
  while (words.length > 1 && SUFFIX.test(words[words.length - 1])) suffix = [words.pop(), suffix].filter(Boolean).join(" ");
  if (words.length === 1) return { title, last: words[0], suffix };
  return { title, first: words[0] ?? "", middle: words.slice(1, -1).join(" "), last: words[words.length - 1] ?? "", suffix };
}

type Fields = Partial<Record<FieldTarget, string>>;

export function profileFromRow(name: string, f: Fields): { type: CardType; profile: Profile } {
  const profile = emptyProfile();
  const isCompany = COMPANY.test(name) && !f.clientFirst && !f.clientLast;
  if (isCompany) {
    profile.company.name = name;
    if (/trust/i.test(name)) profile.company.entityType = "Trust";
    else if (/estate of/i.test(name)) profile.company.entityType = "Estate";
    else if (/LLC|L\.L\.C\./i.test(name)) profile.company.entityType = "LLC";
  } else {
    const parts =
      f.clientFirst || f.clientLast
        ? [{ title: f.clientTitle ?? "", first: f.clientFirst ?? "", last: f.clientLast ?? "" } as Partial<Person>]
        : name.split(/\s+(?:&|and)\s+/i).map(parsePerson);
    profile.people = parts.slice(0, 6).map((pp) => ({ ...newPerson(), ...pp }));
  }
  fillContacts(isCompany ? "company" : "person", profile, f);
  return { type: isCompany ? "company" : "person", profile };
}

function setIfEmpty(lines: ContactLine[], kind: ContactKind, value: string | undefined): ContactLine[] {
  if (!value) return lines;
  const i = lines.findIndex((c) => c.kind === kind);
  if (i >= 0) return lines[i].value.trim() ? lines : lines.map((c, j) => (j === i ? { ...c, value } : c));
  return [...lines, { kind, value }];
}

// Adds the LEAP contact details and address where the card has nothing yet.
function fillContacts(type: CardType, profile: Profile, f: Fields) {
  if (type === "company") {
    profile.company.contacts = setIfEmpty(setIfEmpty(setIfEmpty(profile.company.contacts, "Email", f.clientEmail), "Phone", f.clientPhone), "Cell", f.clientCell);
  } else if (profile.people[0]) {
    const p0 = profile.people[0];
    p0.contacts = setIfEmpty(setIfEmpty(setIfEmpty(p0.contacts, "Email", f.clientEmail), "Phone", f.clientPhone), "Cell", f.clientCell);
  }
  const a = profile.address.street;
  const street = [f.clientStreet, f.clientStreet2].filter(Boolean).join(", ");
  if (!a.street && street) a.street = street.slice(0, 160);
  if (!a.city && f.clientCity) a.city = f.clientCity.slice(0, 80);
  if (!a.state && f.clientState) a.state = f.clientState.slice(0, 40);
  if (!a.zip && f.clientZip) a.zip = f.clientZip.slice(0, 12);
  if (f.clientCountry && (!a.country || a.country === "United States")) a.country = f.clientCountry.slice(0, 80);
  if (!profile.intake.mailingAddress && f.mailingAddress) profile.intake.mailingAddress = f.mailingAddress.slice(0, 300);
  if (!profile.notes && f.notes) profile.notes = f.notes.slice(0, 5000);
}

const hasNames = (type: CardType, pr: Profile) => (type === "company" ? !!pr.company.name.trim() : pr.people.some((p) => p.first.trim() || p.last.trim()));

// ── Matter Details for each side ──────────────────────────────────────────────
export function detailValues(code: string, client: string, address: string, other: string, f: Fields): Record<string, string> {
  const [mine, theirs, theirAttorney] =
    code === "REP" || code === "REF" ? ["buyer", "seller", "sellerAttorney"] : code === "RES" ? ["seller", "buyer", "buyerAttorney"] : ["client", "other", "otherAttorney"];
  const v: Record<string, string | undefined> = {
    [`${mine}Names`]: client,
    [`${mine}Email`]: f.clientEmail,
    [`${mine}Phone`]: f.clientCell || f.clientPhone,
    ...(mine !== "client" ? { [`${mine}Address`]: [f.clientStreet, f.clientStreet2, f.clientCity, [f.clientState, f.clientZip].filter(Boolean).join(" ")].filter(Boolean).join(", ") } : {}),
    [`${theirs}Names`]: other,
    ...(theirs !== "other" ? { [`${theirs}Email`]: f.otherEmail, [`${theirs}Phone`]: f.otherPhone } : {}),
    [`${theirAttorney}Name`]: f.otherAttorneyName,
    [`${theirAttorney}Firm`]: f.otherAttorneyFirm,
    [`${theirAttorney}Email`]: f.otherAttorneyEmail,
    [`${theirAttorney}Phone`]: f.otherAttorneyPhone,
    property: address,
  };
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x && x.trim()).map(([k, x]) => [k, x!.trim().slice(0, 500)]));
}

// Fills empty Details (and ones that came from LEAP before); never what someone typed.
function mergeDetails(current: unknown, values: Record<string, string>) {
  const d = (current && typeof current === "object" ? { ...(current as Record<string, { value?: string; manual?: boolean; source?: string }>) } : {}) as Record<
    string,
    { value?: string; manual?: boolean; source?: string }
  >;
  let changed = false;
  for (const [k, v] of Object.entries(values)) {
    const cur = d[k];
    if (cur?.manual || (cur?.value && cur.source !== "LEAP")) continue;
    if (cur?.value === v) continue;
    d[k] = { value: v, source: "LEAP" };
    changed = true;
  }
  return { details: d, changed };
}

// LEAP columns that fit no field, kept on the matter so nothing is lost.
const extrasText = (extras: Record<string, string> | undefined, f: Fields, code: string) => {
  const lines = Object.entries(extras ?? {}).map(([k, v]) => `${k}: ${v}`);
  // General matters have no Details field for the other side's own email / phone.
  if (code !== "REP" && code !== "REF" && code !== "RES") {
    if (f.otherEmail) lines.push(`Other side email: ${f.otherEmail}`);
    if (f.otherPhone) lines.push(`Other side phone: ${f.otherPhone}`);
  }
  return lines.length ? `Other LEAP information:\n${lines.join("\n")}` : "";
};

export async function importLeapMatters(input: unknown) {
  const { user } = await requireUserOrg();
  if (!templatesAllowed(user.email)) throw new ImportError(403, "Importing from LEAP isn't set up for your firm.");
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const rows = (Array.isArray(input) ? input : []).slice(0, 1000) as Partial<LeapRow>[];
  if (!rows.length) throw new ImportError(400, "Nothing to import.");

  const [{ data: existing }, { data: clients }, { data: team }] = await Promise.all([
    db.from("matters").select("id, matter_number, details, description, client_id, counterparty").eq("org_id", orgId).not("matter_number", "is", null).limit(20000),
    db.from("clients").select("id, name, email, phone, address, card_type, profile").eq("org_id", orgId).limit(20000),
    db.from("profiles").select("id, email, full_name").eq("org_id", orgId),
  ]);
  type ExMatter = { id: string; matter_number: string; details: unknown; description: string | null; client_id: string | null; counterparty: string | null };
  type ExClient = { id: string; name: string; email: string | null; phone: string | null; address: string | null; card_type: string | null; profile: unknown };
  const byNumber = new Map(((existing ?? []) as ExMatter[]).map((m) => [m.matter_number.toUpperCase(), m]));
  const clientByName = new Map(((clients ?? []) as ExClient[]).map((c) => [c.name.trim().toLowerCase(), c]));
  const byInitials = new Map<string, string>();
  for (const p of (team ?? []) as { id: string; email: string; full_name?: string | null }[]) if (p.full_name) byInitials.set(initialsOf(p.full_name), p.id);

  const result = { created: 0, updated: 0, skipped: [] as string[], failed: [] as { number: string; error: string }[], clientsCreated: 0, clientsUpdated: 0 };

  type Clean = { number: string; code: string; client: string; address: string; other: string; leapStatus: string; matterType: string; resp: string; fields: Fields; extras: Record<string, string> };
  const todo: Clean[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const m = /^([A-Z][A-Z0-9]{1,5})-(\d{4})-(\d{3,6})$/.exec(txt(r.number, 30).toUpperCase());
    if (!m || seen.has(m[0])) continue;
    seen.add(m[0]);
    const fields: Fields = {};
    for (const [k, v] of Object.entries((r.fields ?? {}) as Record<string, unknown>)) if (typeof v === "string" && v.trim()) fields[k as FieldTarget] = txt(v, 500);
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries((r.extras ?? {}) as Record<string, unknown>).slice(0, 40)) if (typeof v === "string" && v.trim()) extras[txt(k, 80)] = txt(v, 500);
    todo.push({
      number: m[0],
      code: m[1],
      client: txt(r.client, 200) || "Unknown client",
      address: txt(r.address, 300),
      other: txt(r.other, 300),
      leapStatus: txt(r.leapStatus, 80),
      matterType: txt(r.matterType, 300),
      resp: txt(r.resp, 10).toUpperCase(),
      fields,
      extras,
    });
  }

  // 1. Clients: create new ones (with a proper card); fill gaps on existing ones.
  const newClients = new Map<string, { type: CardType; profile: Profile; f: Fields }>();
  const toUpdateClients = new Map<string, { row: ExClient; f: Fields; name: string }>();
  for (const t of todo) {
    const key = t.client.toLowerCase();
    const ex = clientByName.get(key);
    if (!ex) {
      if (!newClients.has(key)) newClients.set(key, { ...profileFromRow(t.client, t.fields), f: t.fields });
    } else if (!toUpdateClients.has(ex.id)) toUpdateClients.set(ex.id, { row: ex, f: t.fields, name: t.client });
  }
  const newList = [...newClients.entries()];
  for (let i = 0; i < newList.length; i += CHUNK) {
    const batch = newList.slice(i, i + CHUNK).map(([key, c]) => {
      const name = todo.find((t) => t.client.toLowerCase() === key)!.client;
      const core = coreFields(c.type, c.profile);
      return {
        org_id: orgId,
        name,
        description: "Imported from LEAP",
        status: "Active",
        type: c.type === "company" ? "Legal entity" : "Individual",
        email: core.email || null,
        phone: core.phone || null,
        address: core.address,
        card_type: c.type,
        profile: c.profile,
      };
    });
    let { data, error } = await db.from("clients").insert(batch).select("id, name, email, phone, address, card_type, profile");
    if (error && /profile|card_type/.test(error.message ?? "")) {
      // Before client cards (0018): names and contact only.
      ({ data, error } = await db.from("clients").insert(batch.map(({ card_type: _c, profile: _p, ...rest }) => (void _c, void _p, rest))).select("id, name, email, phone, address"));
    }
    if (error) throw error;
    for (const c of (data ?? []) as ExClient[]) clientByName.set(c.name.trim().toLowerCase(), c);
    result.clientsCreated += (data ?? []).length;
  }
  for (const { row, f, name } of toUpdateClients.values()) {
    const type: CardType = row.card_type === "company" ? "company" : "person";
    let profile = normalizeProfile(row.profile ?? {});
    let cardType = type;
    if (!hasNames(type, profile)) {
      // Imported before with just a name: build the card properly now.
      const built = profileFromRow(name, f);
      profile = { ...built.profile, notes: profile.notes || built.profile.notes };
      cardType = built.type;
    } else fillContacts(type, profile, f);
    const before = JSON.stringify(row.profile ?? null);
    if (JSON.stringify(profile) === before && row.card_type === cardType) continue;
    const core = coreFields(cardType, profile);
    const { error } = await db
      .from("clients")
      .update({
        card_type: cardType,
        profile,
        email: row.email || core.email || null,
        phone: row.phone || core.phone || null,
        address: row.address || core.address,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("org_id", orgId);
    if (!error) result.clientsUpdated++;
  }

  // 2. Matters: new ones in batches; existing ones get the missing information.
  const fresh = todo.filter((t) => !byNumber.has(t.number));
  const known = todo.filter((t) => byNumber.has(t.number));
  const toInsert = fresh.map((t) => {
    const closed = /file complete|not proceeding|closed|archived|cancel+ed/i.test(t.leapStatus);
    const { details } = mergeDetails({}, detailValues(t.code, t.client, t.address, t.other, t.fields));
    return {
      number: t.number,
      row: {
        org_id: orgId,
        title: (t.address ? `${t.client} – ${t.address}` : t.matterType && !/\d/.test(t.matterType) ? `${t.client} – ${t.matterType}` : t.client).slice(0, 300),
        description: [t.matterType, `Imported from LEAP${t.leapStatus ? ` · LEAP status: ${t.leapStatus}` : ""}`, extrasText(t.extras, t.fields, t.code)].filter(Boolean).join("\n"),
        status: closed ? "Closed" : "Active",
        client_id: clientByName.get(t.client.toLowerCase())?.id ?? null,
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
    for (const b of batch) {
      const { error: e1 } = await db.from("matters").insert(b.row);
      if (e1) result.failed.push({ number: b.number, error: /duplicate|unique/i.test(e1.message ?? "") ? "already in LawPower" : (e1.message ?? "couldn't be created").slice(0, 160) });
      else result.created++;
    }
  }
  for (const t of known) {
    const ex = byNumber.get(t.number)!;
    const { details, changed } = mergeDetails(ex.details, detailValues(t.code, t.client, t.address, t.other, t.fields));
    const patch: Record<string, unknown> = {};
    if (changed) patch.details = details;
    const clientId = clientByName.get(t.client.toLowerCase())?.id;
    if (!ex.client_id && clientId) patch.client_id = clientId;
    if (!ex.counterparty && t.other) patch.counterparty = t.other;
    const extra = extrasText(t.extras, t.fields, t.code);
    if (extra && !(ex.description ?? "").includes("Other LEAP information")) patch.description = [ex.description, extra].filter(Boolean).join("\n");
    if (!Object.keys(patch).length) {
      result.skipped.push(t.number);
      continue;
    }
    const { error } = await db.from("matters").update(patch).eq("id", ex.id).eq("org_id", orgId);
    if (error) result.failed.push({ number: t.number, error: (error.message ?? "couldn't be updated").slice(0, 160) });
    else result.updated++;
  }
  return result;
}
