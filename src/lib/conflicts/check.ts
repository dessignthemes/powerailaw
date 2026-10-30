import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, aiConfig } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/usage";
import { usageToday } from "@/lib/ai/store";
import { layoutFor, type MatterDetails } from "@/lib/matters/details";
import { normalizeProfile, type CardType } from "@/lib/clients/card";
import { findCandidates, splitNames, type Candidate, type Party, type Searched, type Side } from "@/lib/conflicts/match";

// Conflict check: is the person or company being taken on as a client already
// in any matter (lead, open or closed), and on which side? Candidates are found
// by name, email and phone across every matter; the AI then reviews them.

export type ConflictHit = {
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string;
  matterStatus: string;
  name: string;
  role: string;
  verdict: "adverse" | "same_side" | "related";
  match: "likely" | "possible";
  reason: string;
};

export type ConflictCheck = {
  id: string;
  clientId: string | null;
  label: string;
  searched: Searched;
  result: "clear" | "review" | "conflict";
  summary: string;
  hits: ConflictHit[];
  aiUsed: boolean;
  mattersChecked: number;
  decision: "cleared" | "conflict" | null;
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
  archived: boolean;
  createdBy: string | null;
  createdAt: string;
};

export class ConflictError extends Error {
  constructor(public status: 400 | 404 | 503, message: string, public code?: string) {
    super(message);
  }
}

const db = () => createAdminClient();
const missingTable = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /conflict_checks/.test(e.message ?? ""));
export const setupError = () => new ConflictError(503, "Conflict checks need a database update first (migration 0057).", "setup");

type MatterRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string | null;
  counterparty: string | null;
  client_id: string | null;
  matter_code?: string | null;
  matter_number?: string | null;
  details?: MatterDetails | null;
};
type ClientRow = { id: string; name: string; email: string | null; phone: string | null; card_type?: string | null; profile?: unknown };

// What to look for, from a client card.
export function searchedFromClient(c: ClientRow): Searched {
  const s: Searched = { names: [], companies: [], emails: [], phones: [] };
  const type: CardType = c.card_type === "company" ? "company" : "person";
  const hasProfile = c.profile && typeof c.profile === "object" && Object.keys(c.profile as object).length > 0;
  if (hasProfile) {
    const pr = normalizeProfile(c.profile);
    if (type === "company") {
      s.companies.push(pr.company.name, pr.company.legalName);
      for (const l of pr.company.contacts) (l.kind === "Email" ? s.emails : l.kind === "Phone" || l.kind === "Cell" ? s.phones : []).push(l.value);
    } else {
      for (const p of pr.people) {
        s.names.push([p.first, p.middle, p.last].filter(Boolean).join(" "), [p.first, p.last].filter(Boolean).join(" "));
        for (const prev of splitNames(p.previousNames)) s.names.push(prev.includes(" ") ? prev : [p.first, prev].filter(Boolean).join(" "));
        for (const l of p.contacts) (l.kind === "Email" ? s.emails : l.kind === "Phone" || l.kind === "Cell" ? s.phones : []).push(l.value);
      }
    }
  }
  (type === "company" ? s.companies : s.names).push(c.name);
  if (c.email) s.emails.push(c.email);
  if (c.phone) s.phones.push(c.phone);
  return cleanSearched(s);
}

export function cleanSearched(raw: Partial<Record<keyof Searched, unknown>>): Searched {
  const list = (v: unknown, max: number) =>
    [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, 160)).filter(Boolean))].slice(0, max);
  return { names: list(raw.names, 12), companies: list(raw.companies, 6), emails: list(raw.emails, 6), phones: list(raw.phones, 6) };
}

// Everyone in every matter (and client records), as parties to compare against.
async function firmParties(orgId: string, excludeClientId: string | null) {
  const s = db();
  let mQ = await s.from("matters").select("id, title, description, status, category, counterparty, client_id, matter_code, matter_number, details").eq("org_id", orgId).limit(10000);
  if (mQ.error) mQ = (await s.from("matters").select("id, title, description, status, category, counterparty, client_id").eq("org_id", orgId).limit(10000)) as typeof mQ;
  if (mQ.error) throw mQ.error;
  let cQ = await s.from("clients").select("id, name, email, phone, card_type, profile").eq("org_id", orgId).limit(20000);
  if (cQ.error) cQ = (await s.from("clients").select("id, name, email, phone").eq("org_id", orgId).limit(20000)) as typeof cQ;
  if (cQ.error) throw cQ.error;
  const mc = await s.from("matter_contacts").select("matter_id, contact_id, client_id, role").eq("org_id", orgId).limit(50000);
  const contacts = await s.from("contacts").select("id, name, company, email, phone").eq("org_id", orgId).limit(50000);

  const matters = (mQ.data ?? []) as MatterRow[];
  const clients = new Map(((cQ.data ?? []) as ClientRow[]).map((c) => [c.id, c]));
  const contactById = new Map(((contacts.data ?? []) as { id: string; name: string; company: string; email: string | null; phone: string | null }[]).map((c) => [c.id, c]));
  const parties: Party[] = [];
  const clientParties = (c: ClientRow, matterId: string | null, role: string, side: Side, source: Party["source"]) => {
    const sr = searchedFromClient(c);
    for (const n of [...new Set([...sr.names, ...sr.companies])]) parties.push({ matterId, name: n, role, side, emails: sr.emails, phones: sr.phones, source });
  };

  const linkedClients = new Set<string>();
  for (const m of matters) {
    const c = m.client_id ? clients.get(m.client_id) : null;
    if (c && c.id !== excludeClientId) {
      linkedClients.add(c.id);
      clientParties(c, m.id, "Client", "client", "client");
    } else if (c) linkedClients.add(c.id);
    for (const n of splitNames(m.counterparty ?? "")) parties.push({ matterId: m.id, name: n, role: "Other side (counterparty)", side: "adverse", emails: [], phones: [], source: "counterparty" });
    // Parties written in the matter's details (buyer, seller, attorneys, realtors…).
    const d = m.details && typeof m.details === "object" ? m.details : {};
    const val = (k: string) => String(d[k]?.value ?? "").trim();
    for (const sec of layoutFor({ matterCode: m.matter_code, category: m.category }).layout) {
      const emails = sec.fields.filter((f) => f.kind === "email").map((f) => val(f.key)).filter(Boolean);
      const phones = sec.fields.filter((f) => f.kind === "phone").map((f) => val(f.key)).filter(Boolean);
      for (const f of sec.fields) {
        const v = val(f.key);
        if (!v) continue;
        const isName = f.kind === "names" || /(Name|Firm)$/.test(f.key) || /^(inspector|surveyor|titleCompany)$/.test(f.key);
        if (!isName || f.kind === "email" || f.kind === "phone" || f.kind === "money") continue;
        const side: Side = sec.client ? "client" : /^(buyer|seller|other)$/.test(sec.id) && f.kind === "names" ? "adverse" : "third_party";
        const role = f.kind === "names" ? sec.title : `${sec.title} — ${f.label}`;
        for (const n of f.kind === "names" ? splitNames(v) : [v]) parties.push({ matterId: m.id, name: n, role, side, emails: f.kind === "names" ? emails : [], phones: f.kind === "names" ? phones : [], source: "matter_details" });
      }
    }
    // The title / description may name people too ("Smith v. Jones", "Kowalski purchase").
    parties.push({ matterId: m.id, name: `${m.title} ${(m.description ?? "").slice(0, 600)}`, role: "Named in the matter's title or description", side: "unknown", emails: [], phones: [], source: "title" });
  }
  for (const r of (mc.data ?? []) as { matter_id: string; contact_id: string | null; client_id: string | null; role: string }[]) {
    const role = r.role?.trim() || "Matter contact";
    const side: Side = /client/i.test(role) ? "client" : /attorney|counsel|lawyer|realtor|agent|broker|lender|title|inspector|surveyor|appraiser|accountant|notary/i.test(role) ? "third_party" : /opposing|adverse|other side|defendant|plaintiff|respondent|petitioner|seller|buyer|landlord|tenant/i.test(role) ? "adverse" : "unknown";
    if (r.client_id) {
      const c = clients.get(r.client_id);
      if (c && c.id !== excludeClientId) clientParties(c, r.matter_id, role, side, "matter_contact");
    } else if (r.contact_id) {
      const c = contactById.get(r.contact_id);
      if (!c) continue;
      for (const n of [c.name, c.company].filter((x) => x && x.trim())) parties.push({ matterId: r.matter_id, name: n, role, side, emails: c.email ? [c.email] : [], phones: c.phone ? [c.phone] : [], source: "matter_contact" });
    }
  }
  // Clients with no matter yet: worth knowing they're already on file.
  for (const c of clients.values()) if (!linkedClients.has(c.id) && c.id !== excludeClientId) clientParties(c, null, "Client record (no matter)", "client", "client_record");

  return { parties, matters: new Map(matters.map((m) => [m.id, m])), matterCount: matters.length };
}

const SYSTEM = `You help a New Jersey law firm run conflict-of-interest checks before taking on a new client.
You get the person or company being checked, and a list of CANDIDATES: people and companies from the firm's own matters (every status: leads, open and closed matters) whose name, email or phone looks similar.

For each candidate decide:
- match: is it the same person/company as the one being checked? "likely" (same full name, or same email/phone, and nothing contradicts it), "possible" (could be: same last name and initial, a common name, a slightly different spelling, or a Polish surname in its other gender form such as Kowalski/Kowalska which may be a relative), or "no" (clearly someone else, e.g. a different first name and nothing else in common — but keep a same-last-name relative as "possible" when the role is adverse, because a family member on the other side can matter).
- verdict:
  "adverse" = the candidate is or was on the OTHER side of one of the firm's matters (the seller when the firm's client was the buyer, the buyer when the firm's client was the seller, the other party, the counterparty, the opposing party). This is a potential conflict.
  "same_side" = the candidate is or was the firm's own client or on the client's side (co-buyer, co-seller, the client in the title).
  "related" = the candidate was involved but not as a party: another firm's attorney, a realtor, lender, title company, inspector; or only mentioned in a title/description where the role is unclear.
Use the role text and the matter title to tell sides; "(our client)" means the firm's client. When a candidate is only "Named in the matter's title or description", work out the role from the title if you can (e.g. "Smith v. Jones", "Purchase from Nowak"), otherwise use "related".

Reply with JSON only, no other text:
{"summary": "one to three plain sentences for the attorney: what was found and whether it looks like a conflict", "hits": [{"id": "C1", "match": "likely|possible|no", "verdict": "adverse|same_side|related", "reason": "short reason, naming the matter and role"}]}
Include every candidate in "hits". Never invent matters or people that are not in the list.`;

function verdictFromSide(s: Side): ConflictHit["verdict"] {
  return s === "adverse" ? "adverse" : s === "client" ? "same_side" : "related";
}

function resultOf(hits: ConflictHit[]): ConflictCheck["result"] {
  if (hits.some((h) => h.verdict === "adverse" && h.match === "likely")) return "conflict";
  if (hits.some((h) => h.verdict === "adverse" || h.verdict === "related")) return "review";
  return "clear";
}

const label = (s: Searched) => [...s.names, ...s.companies][0] ?? s.emails[0] ?? s.phones[0] ?? "Unnamed";

export async function runConflictCheck(opts: {
  orgId: string;
  userId: string | null;
  email?: string | null;
  searched: Searched;
  clientId?: string | null;
  notes?: string;
}): Promise<ConflictCheck> {
  const searched = cleanSearched(opts.searched);
  if (!searched.names.length && !searched.companies.length && !searched.emails.length && !searched.phones.length) {
    throw new ConflictError(400, "Enter a name, company, email or phone to check.");
  }
  const clientId = opts.clientId ?? null;
  const { parties, matters, matterCount } = await firmParties(opts.orgId, clientId);
  const candidates = findCandidates(searched, parties, 60);
  const mInfo = (id: string | null) => {
    const m = id ? matters.get(id) : null;
    return { matterId: m?.id ?? null, matterNumber: m?.matter_number ?? null, matterTitle: m?.title ?? "", matterStatus: m?.status ?? "" };
  };

  let hits: ConflictHit[] = [];
  let summary = "";
  let aiUsed = false;

  if (!candidates.length) {
    summary = `No one with a similar name, email or phone appears in any of the firm's ${matterCount} matters or client records.`;
  } else {
    const ai = await reviewWithAi(opts, searched, candidates, mInfo).catch((e) => {
      console.error("Conflict check AI review failed:", e);
      return null;
    });
    if (ai) {
      aiUsed = true;
      hits = ai.hits;
      summary = ai.summary;
    } else {
      // Without the AI: list the stronger matches for a person to review.
      hits = candidates
        .filter((c) => c.score >= 2)
        .map((c) => ({ ...mInfo(c.matterId), name: c.name.slice(0, 200), role: c.role, verdict: verdictFromSide(c.side), match: c.score >= 3 ? ("likely" as const) : ("possible" as const), reason: c.why }));
      summary = hits.length
        ? `${hits.length} possible ${hits.length === 1 ? "match" : "matches"} found by name, email or phone. The AI review wasn't available, so please look them over.`
        : "Only loose name matches were found (same last name, different first name). The AI review wasn't available.";
    }
  }
  const order = { adverse: 0, related: 1, same_side: 2 } as const;
  hits.sort((a, b) => order[a.verdict] - order[b.verdict] || (a.match === b.match ? 0 : a.match === "likely" ? -1 : 1));
  const result = resultOf(hits);

  const row = {
    org_id: opts.orgId,
    client_id: clientId,
    label: label(searched).slice(0, 300),
    searched,
    result,
    summary: summary.slice(0, 4000),
    hits: hits.slice(0, 60),
    ai_used: aiUsed,
    matters_checked: matterCount,
    created_by: opts.userId,
  };
  const { data, error } = await db().from("conflict_checks").insert(row).select("*").single();
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  return toCheck(data);
}

async function reviewWithAi(
  opts: { orgId: string; userId: string | null; email?: string | null; notes?: string },
  searched: Searched,
  candidates: Candidate[],
  mInfo: (id: string | null) => { matterId: string | null; matterNumber: string | null; matterTitle: string; matterStatus: string }
): Promise<{ summary: string; hits: ConflictHit[] } | null> {
  const provider = getProvider();
  if (!provider || !opts.userId) return null;
  const cfg = aiConfig();
  const u = await usageToday({ orgId: opts.orgId, userId: opts.userId, email: opts.email ?? null });
  if (u.requests >= cfg.dailyRequestLimit || u.tokens >= cfg.dailyTokenLimit) return null;

  const list = candidates.map((c, i) => {
    const m = mInfo(c.matterId);
    return {
      id: `C${i + 1}`,
      name: c.source === "title" ? undefined : c.name.slice(0, 160),
      role: c.role,
      matter: c.matterId ? `${m.matterNumber ? `${m.matterNumber} · ` : ""}${m.matterTitle}`.slice(0, 200) : "(client record, no matter)",
      matterStatus: m.matterStatus || undefined,
      text: c.source === "title" ? c.name.slice(0, 400) : undefined,
      whyFound: c.why,
    };
  });
  const user = `Being checked:\n${JSON.stringify({ names: searched.names, companies: searched.companies, emails: searched.emails, phones: searched.phones, notes: opts.notes?.slice(0, 500) || undefined })}\n\nCandidates:\n${JSON.stringify(list)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let text = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    for await (const ev of provider.stream({ system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: user }] }], tools: [], maxTokens: 4000, signal: controller.signal })) {
      if (ev.type === "text") text += ev.delta;
      if (ev.type === "done") usage = ev.usage;
    }
  } finally {
    clearTimeout(timer);
  }
  await recordAiUsage({ orgId: opts.orgId, userId: opts.userId, feature: "conflicts", model: provider.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });

  const json = text.replace(/```json|```/g, "").trim();
  const raw = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1)) as { summary?: unknown; hits?: unknown };
  const byId = new Map(list.map((l, i) => [l.id, candidates[i]]));
  const hits: ConflictHit[] = [];
  for (const h of Array.isArray(raw.hits) ? (raw.hits as Record<string, unknown>[]) : []) {
    const c = byId.get(String(h.id ?? ""));
    if (!c) continue;
    const match = h.match === "likely" ? "likely" : h.match === "possible" ? "possible" : null;
    if (!match) continue;
    const verdict = h.verdict === "adverse" || h.verdict === "same_side" || h.verdict === "related" ? h.verdict : verdictFromSide(c.side);
    hits.push({
      ...mInfo(c.matterId),
      name: c.source === "title" ? "" : c.name.slice(0, 200),
      role: c.role,
      verdict,
      match,
      reason: String(h.reason ?? c.why).slice(0, 500),
    });
  }
  return { summary: String(raw.summary ?? "").slice(0, 2000), hits };
}

export function toCheck(r: Record<string, unknown>): ConflictCheck {
  return {
    id: r.id as string,
    clientId: (r.client_id as string) ?? null,
    label: (r.label as string) ?? "",
    searched: cleanSearched((r.searched as Searched) ?? {}),
    result: (r.result as ConflictCheck["result"]) ?? "clear",
    summary: (r.summary as string) ?? "",
    hits: Array.isArray(r.hits) ? (r.hits as ConflictHit[]) : [],
    aiUsed: r.ai_used !== false,
    mattersChecked: Number(r.matters_checked ?? 0),
    decision: (r.decision as ConflictCheck["decision"]) ?? null,
    decisionNote: (r.decision_note as string) ?? "",
    decidedBy: (r.decided_by as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    archived: r.archived === true,
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function runForClient(orgId: string, userId: string | null, email: string | null, clientId: string) {
  const s = db();
  let r = await s.from("clients").select("id, name, email, phone, card_type, profile").eq("org_id", orgId).eq("id", clientId).maybeSingle();
  if (r.error) r = (await s.from("clients").select("id, name, email, phone").eq("org_id", orgId).eq("id", clientId).maybeSingle()) as typeof r;
  if (r.error) throw r.error;
  if (!r.data) throw new ConflictError(404, "That client wasn't found.");
  return runConflictCheck({ orgId, userId, email, searched: searchedFromClient(r.data as ClientRow), clientId });
}

export async function listChecks(orgId: string, opts: { clientId?: string | null } = {}) {
  let q = db().from("conflict_checks").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(opts.clientId ? 20 : 300);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q;
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  return (data ?? []).map((r) => toCheck(r));
}

export async function decideCheck(orgId: string, userId: string, id: string, body: { decision?: unknown; note?: unknown; archived?: unknown }) {
  const patch: Record<string, unknown> = {};
  if (body.decision !== undefined) {
    const d = body.decision === "cleared" || body.decision === "conflict" ? body.decision : null;
    patch.decision = d;
    patch.decided_by = d ? userId : null;
    patch.decided_at = d ? new Date().toISOString() : null;
  }
  if (body.note !== undefined) patch.decision_note = String(body.note ?? "").slice(0, 2000);
  if (body.archived !== undefined) patch.archived = body.archived === true;
  if (!Object.keys(patch).length) throw new ConflictError(400, "Nothing to change.");
  const { data, error } = await db().from("conflict_checks").update(patch).eq("org_id", orgId).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (missingTable(error)) throw setupError();
    throw error;
  }
  if (!data) throw new ConflictError(404, "That conflict check wasn't found.");
  return toCheck(data);
}
