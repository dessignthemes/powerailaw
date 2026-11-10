import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// "Where the business comes from": for each real estate office, realtor, lender,
// law firm / attorney, title company and referral source, how many of the firm's
// matters they're on. Built from the matters' contacts (Details link people and
// companies to Contacts automatically; Related contacts can add more by hand).

const db = () => createAdminClient();

export type RelRow = { id: string; name: string; company: string; deals: number; open: number };
export type RelationshipsReport = {
  matters: number; // matters in the period
  linkedMatters: number; // of those, with at least one linked contact
  offices: RelRow[]; // real estate offices
  realtors: RelRow[];
  lenders: RelRow[];
  lawFirms: RelRow[];
  attorneys: RelRow[];
  titleCompanies: RelRow[];
  others: RelRow[]; // inspectors, surveyors, appraisers, insurance
  referrers: RelRow[]; // who referred the client
  referralTypes: { name: string; value: number }[]; // Attorney, Realtor, Past client…
};

type MatterRow = { id: string; status: string; created_at: string; details?: Record<string, { value?: string }> | null };
type LinkRow = { matter_id: string; contact_id: string | null; role: string };
type ContactRow = { id: string; kind: string; name: string; company: string | null; employer_id?: string | null; vendor_type?: string | null };

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function relationshipsReport(orgId: string, range: { from: string | null; to: string | null }): Promise<RelationshipsReport> {
  const matters = (
    await all<MatterRow>((a, b) => db().from("matters").select("*").eq("org_id", orgId).order("id").range(a, b))
  ).filter((m) => {
    const day = (m.created_at ?? "").slice(0, 10);
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  });
  const inPeriod = new Map(matters.map((m) => [m.id, m]));

  let links: LinkRow[] = [];
  try {
    links = (await all<LinkRow>((a, b) => db().from("matter_contacts").select("matter_id, contact_id, role").eq("org_id", orgId).not("contact_id", "is", null).order("id").range(a, b))).filter((l) =>
      inPeriod.has(l.matter_id)
    );
  } catch {
    links = []; // matter_contacts not set up yet
  }

  // The linked contacts, and the companies their people work at.
  const contacts = new Map<string, ContactRow>();
  const load = async (ids: string[]) => {
    const need = [...new Set(ids)].filter((id) => !contacts.has(id));
    for (let i = 0; i < need.length; i += 200) {
      const { data } = await db().from("contacts").select("*").eq("org_id", orgId).in("id", need.slice(i, i + 200));
      for (const c of (data ?? []) as ContactRow[]) contacts.set(c.id, c);
    }
  };
  await load(links.map((l) => l.contact_id!));
  await load([...contacts.values()].map((c) => c.employer_id).filter(Boolean) as string[]);

  const buckets = {
    offices: new Map<string, Set<string>>(),
    realtors: new Map<string, Set<string>>(),
    lenders: new Map<string, Set<string>>(),
    lawFirms: new Map<string, Set<string>>(),
    attorneys: new Map<string, Set<string>>(),
    titleCompanies: new Map<string, Set<string>>(),
    others: new Map<string, Set<string>>(),
    referrers: new Map<string, Set<string>>(),
  };
  const add = (b: Map<string, Set<string>>, id: string | null | undefined, matterId: string) => {
    if (!id) return;
    if (!b.has(id)) b.set(id, new Set());
    b.get(id)!.add(matterId);
  };

  for (const l of links) {
    const c = contacts.get(l.contact_id!);
    if (!c) continue;
    const employer = c.employer_id ? contacts.get(c.employer_id) : undefined;
    const type = (c.vendor_type || employer?.vendor_type || "").toLowerCase();
    const role = l.role.toLowerCase();
    const person = c.kind === "person";
    const m = l.matter_id;
    if (/refer/.test(role)) {
      add(buckets.referrers, c.id, m);
      continue; // a referral isn't also counted as working the deal
    }
    if (/real estate/.test(type) || /realtor|listing agent|broker/.test(role)) {
      if (person) add(buckets.realtors, c.id, m);
      add(buckets.offices, person ? employer?.id : c.id, m);
    } else if (/lender|bank/.test(type) || /lender|loan/.test(role)) {
      add(buckets.lenders, person ? employer?.id ?? c.id : c.id, m);
    } else if (/law firm/.test(type) || /attorney|counsel/.test(role)) {
      if (person) add(buckets.attorneys, c.id, m);
      add(buckets.lawFirms, person ? employer?.id : c.id, m);
    } else if (/title/.test(type) || /title|settlement/.test(role)) {
      add(buckets.titleCompanies, person ? employer?.id ?? c.id : c.id, m);
    } else if (/inspect|survey|apprais|insurance/.test(`${type} ${role}`)) {
      add(buckets.others, person ? employer?.id ?? c.id : c.id, m);
    }
  }

  const rows = (b: Map<string, Set<string>>): RelRow[] =>
    [...b.entries()]
      .map(([id, set]) => {
        const c = contacts.get(id);
        const employer = c?.employer_id ? contacts.get(c.employer_id) : undefined;
        const open = [...set].filter((mid) => inPeriod.get(mid)?.status !== "Closed").length;
        return { id, name: c?.name ?? "Unknown", company: c?.kind === "person" ? employer?.name ?? c?.company ?? "" : "", deals: set.size, open };
      })
      .sort((a, b) => b.deals - a.deals || a.name.localeCompare(b.name))
      .slice(0, 50);

  // Referral sources by type (the "Source" in a matter's Referred by).
  const types = new Map<string, number>();
  for (const mt of matters) {
    const t = (mt.details?.referralType?.value ?? "").trim();
    if (t) types.set(t, (types.get(t) ?? 0) + 1);
  }

  return {
    matters: matters.length,
    linkedMatters: new Set(links.map((l) => l.matter_id)).size,
    offices: rows(buckets.offices),
    realtors: rows(buckets.realtors),
    lenders: rows(buckets.lenders),
    lawFirms: rows(buckets.lawFirms),
    attorneys: rows(buckets.attorneys),
    titleCompanies: rows(buckets.titleCompanies),
    others: rows(buckets.others),
    referrers: rows(buckets.referrers),
    referralTypes: [...types.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}
