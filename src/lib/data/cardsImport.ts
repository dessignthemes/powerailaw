import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Saves a batch of cards from an Excel / Cards import (read and sorted in the browser,
// checked again here). Cards already brought in by an earlier import (same key) are skipped.
// People are linked to their company card ("works at") once both exist.

export class CardsImportError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

const db = () => createAdminClient();
const MAX_BATCH = 600;
const KINDS = new Set(["person", "company", "trust", "estate"]);
const CATS = new Set(["client", "vendor", "government", "other"]);
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => clip(v, max) || null;

type Clean = {
  key: string;
  kind: string;
  category: string;
  vendorType: string;
  name: string;
  shortName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  workPhone: string | null;
  homePhone: string | null;
  fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  employerKey: string | null;
  employerName: string;
};

function clean(list: unknown): Clean[] {
  if (!Array.isArray(list)) throw new CardsImportError("No cards were sent.");
  if (list.length > MAX_BATCH) throw new CardsImportError(`Send at most ${MAX_BATCH} cards at a time.`);
  const out: Clean[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const name = clip(raw?.name, 200);
    const key = clip(raw?.key, 400);
    if (!name || !key) continue;
    const email = clip(raw.email, 320).toLowerCase();
    const category = CATS.has(String(raw.category)) ? String(raw.category) : "client";
    out.push({
      key,
      kind: KINDS.has(String(raw.kind)) ? String(raw.kind) : "person",
      category,
      vendorType: category === "vendor" || category === "government" ? clip(raw.vendorType, 60) : "",
      name,
      shortName: clip(raw.shortName, 200),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: opt(raw.phone, 60),
      mobile: opt(raw.mobile, 60),
      workPhone: opt(raw.workPhone, 60),
      homePhone: opt(raw.homePhone, 60),
      fax: opt(raw.fax, 60),
      address: opt(raw.address, 500),
      city: opt(raw.city, 100),
      state: opt(raw.state, 40),
      zip: opt(raw.zip, 20),
      employerKey: opt(raw.employerKey, 400),
      employerName: clip(raw.employerName, 200),
    });
  }
  return out;
}

const missingColumns = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || e.code === "23514" || /category|vendor_type|employer_id|short_name|contacts_kind_check|source|external_id/.test(e.message ?? ""));
const setup = () =>
  new CardsImportError("Importing cards needs a database update. Run supabase/migrations/0067_contact_types.sql in the Supabase SQL editor, then try again.", 503, "setup_required");

// Ids of cards already imported, by key.
async function idsByKey(orgId: string, keys: string[]) {
  const found = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db().from("contacts").select("id, external_id").eq("org_id", orgId).eq("source", "cards").in("external_id", keys.slice(i, i + 200));
    if (error) {
      if (missingColumns(error)) throw setup();
      throw error;
    }
    for (const r of (data ?? []) as { id: string; external_id: string }[]) found.set(r.external_id, r.id);
  }
  return found;
}

export async function importCards(orgId: string, userId: string, list: unknown) {
  const cards = clean(list);
  if (!cards.length) return { added: 0, skipped: 0, linked: 0 };
  const existing = await idsByKey(orgId, cards.map((c) => c.key));
  const fresh = cards.filter((c) => !existing.has(c.key));
  const now = new Date().toISOString();
  if (fresh.length) {
    const rows = fresh.map((c) => ({
      org_id: orgId,
      kind: c.kind,
      name: c.name,
      role: "",
      company: c.kind === "person" ? c.employerName : "",
      email: c.email,
      phone: c.phone,
      address: c.address,
      notes: "",
      category: c.category,
      vendor_type: c.vendorType,
      short_name: c.shortName,
      city: c.city,
      state: c.state,
      zip: c.zip,
      mobile: c.mobile,
      work_phone: c.workPhone,
      home_phone: c.homePhone,
      fax: c.fax,
      source: "cards",
      external_id: c.key,
      imported_by: userId,
      created_by: userId,
      created_at: now,
      updated_at: now,
    }));
    const { error } = await db().from("contacts").insert(rows);
    if (error) {
      if (missingColumns(error)) throw setup();
      throw error;
    }
  }
  // Link people to their company (the company may have come in an earlier batch).
  let linked = 0;
  const withEmployer = fresh.filter((c) => c.kind === "person" && c.employerKey);
  if (withEmployer.length) {
    const ids = await idsByKey(orgId, [...new Set(withEmployer.flatMap((c) => [c.key, c.employerKey!]))]);
    const byEmployer = new Map<string, string[]>();
    for (const c of withEmployer) {
      const me = ids.get(c.key);
      const boss = ids.get(c.employerKey!);
      if (!me || !boss || me === boss) continue;
      byEmployer.set(boss, [...(byEmployer.get(boss) ?? []), me]);
    }
    for (const [boss, people] of byEmployer) {
      const { error } = await db().from("contacts").update({ employer_id: boss }).eq("org_id", orgId).in("id", people);
      if (!error) linked += people.length;
    }
  }
  return { added: fresh.length, skipped: cards.length - fresh.length, linked };
}
