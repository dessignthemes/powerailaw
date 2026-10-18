import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentPortalUser, firmName, PortalError } from "@/lib/portal/server";
import { portalSigningToken } from "@/lib/esign/server";

// The client portal's page for one matter (REP / RES and other real estate files):
// closing status, deal details, the parties and documents waiting for a signature.
// Only matters of the signed-in client; names and companies only (no other
// party's phone or email).

const db = () => createAdminClient();
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type KeyDate = { date?: string | null; na?: boolean } | undefined;
type Details = Record<string, { value?: string } | undefined>;

export type Stage = { key: string; label: string; date: string | null; state: "done" | "current" | "upcoming" | "skipped"; star?: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const v = (d: Details, k: string) => (d[k]?.value ?? "").trim();

const STAGE_TEXT: Record<string, string> = {
  opened: "Your file is open. We are reviewing the contract and getting everything ready.",
  attorneyReview: "We are reviewing the contract and any changes with the other side's attorney. Once both sides agree, attorney review is complete.",
  inspection: "The home inspection period is under way. We will handle any repair requests or credits with the other side.",
  mortgage: "The lender is working on the mortgage commitment. Please send the lender anything they ask for promptly.",
  closing: "We are preparing for closing: title, payoffs, the settlement statement and the closing documents.",
  postClosing: "Your closing has taken place. We are recording the deed, sending payoffs and finishing up the file.",
  complete: "Your closing is complete. Thank you for trusting us with your transaction.",
};

export function closingStages(m: { status: string; created_at: string; key_dates?: { dates?: Record<string, KeyDate>; facts?: { cash?: boolean } } | null }) {
  const dates = m.key_dates?.dates ?? {};
  const cash = !!m.key_dates?.facts?.cash || !!dates.mortgage?.na;
  const t = today();
  const raw: { key: string; label: string; date: string | null; skip?: boolean; star?: boolean }[] = [
    { key: "opened", label: "Opened", date: m.created_at.slice(0, 10) },
    { key: "attorneyReview", label: "Attorney Review", date: dates.attorneyReviewCompleted?.date ?? null },
    { key: "inspection", label: "Inspection", date: dates.inspection?.date ?? null },
    { key: "mortgage", label: "Mortgage Commitment", date: cash ? null : dates.mortgage?.date ?? null, skip: cash },
    { key: "closing", label: "Estimated Closing", date: dates.closing?.date ?? null, star: true },
    { key: "postClosing", label: "Post-Closing", date: null },
    { key: "complete", label: "Complete", date: null },
  ];
  const closed = m.status === "Closed";
  // Done: its date has passed (Complete only once the matter is closed).
  // Post-Closing and Complete are done once the matter is closed.
  const done = raw.map((s, i) => (s.skip ? true : s.key === "complete" || s.key === "postClosing" ? closed : i === 0 ? true : closed || (!!s.date && s.date <= t)));
  // Steps are in order: a later step done means the earlier ones are too.
  for (let i = done.length - 2; i >= 0; i--) if (done[i + 1] && !raw[i].skip) done[i] = true;
  const currentIdx = closed ? raw.length - 1 : done.findIndex((d, i) => !d && !raw[i].skip);
  const stages: Stage[] = raw.map((s, i) => ({
    key: s.key,
    label: s.label,
    date: s.date,
    star: s.star,
    state: s.skip ? "skipped" : i === currentIdx ? "current" : done[i] ? "done" : "upcoming",
  }));
  const current = stages.find((s) => s.state === "current") ?? stages[stages.length - 1];
  return { stages, current: current.label, description: STAGE_TEXT[current.key] ?? "", closingDate: dates.closing?.date ?? null };
}

async function clientMatterRow(matterId: unknown) {
  const u = await currentPortalUser();
  if (!uuid(matterId)) throw new PortalError(404, "Matter not found.");
  const { data, error } = await db().from("matters").select("*").eq("id", matterId).eq("org_id", u.org_id).eq("client_id", u.client_id).maybeSingle();
  if (error) throw error;
  if (!data) throw new PortalError(404, "Matter not found.");
  return { u, m: data as Record<string, unknown> };
}

export async function portalMatterView(matterId: unknown) {
  const { u, m } = await clientMatterRow(matterId);
  const code = String(m.matter_code ?? "").toUpperCase();
  const realEstate = m.category === "Real Estate" || ["REP", "RES", "REF"].includes(code);
  const details = ((m.details ?? {}) as Details) || {};
  const sale = code === "RES";
  const firm = await firmName(u.org_id);

  // Your attorney: the person assigned to the matter.
  let attorney: string | null = null;
  if (m.assigned_to) {
    const { data: p } = await db().from("profiles").select("full_name, email").eq("id", m.assigned_to).maybeSingle();
    attorney = (p?.full_name as string | null) || (p?.email as string | null) || null;
  }

  const parties: { role: string; name: string; company?: string }[] = [];
  const add = (role: string, name: string, company = "") => {
    if (name || company) parties.push({ role, name: name || company, ...(name && company ? { company } : {}) });
  };
  if (realEstate) {
    add(sale ? "Seller (our client)" : "Buyer (our client)", v(details, sale ? "sellerNames" : "buyerNames"));
    add(sale ? "Seller's attorney" : "Buyer's attorney", attorney ?? "", firm);
    add(sale ? "Buyer" : "Seller", v(details, sale ? "buyerNames" : "sellerNames"));
    add(sale ? "Buyer's attorney" : "Seller's attorney", v(details, sale ? "buyerAttorneyName" : "sellerAttorneyName"), v(details, sale ? "buyerAttorneyFirm" : "sellerAttorneyFirm"));
    add("Buyer's realtor", v(details, "buyerAgentName"), v(details, "buyerAgentFirm"));
    add("Seller's realtor", v(details, "sellerAgentName"), v(details, "sellerAgentFirm"));
    add("Lender", v(details, "lender"));
    add("Title company", v(details, "titleCompany"));
    add("Settlement agent", v(details, "settlementAgent"));
  } else {
    add("Our client", v(details, "clientNames"));
    add("Your attorney", attorney ?? "", firm);
    add("Other party", v(details, "otherNames"));
    add("Other party's attorney", v(details, "otherAttorneyName"), v(details, "otherAttorneyFirm"));
  }

  // Documents waiting for this person's signature on this matter.
  const { data: docs } = await db().from("documents").select("id, title").eq("org_id", u.org_id).eq("matter_id", m.id as string);
  const docTitle = new Map(((docs ?? []) as { id: string; title: string }[]).map((d) => [d.id, d.title]));
  let toSign: { id: string; title: string; sentAt: string }[] = [];
  if (docTitle.size) {
    const { data: reqs } = await db()
      .from("signature_requests")
      .select("id, document_id, signer_email, status, expires_at, created_at")
      .eq("org_id", u.org_id)
      .in("document_id", [...docTitle.keys()])
      .in("status", ["sent", "viewed"]);
    toSign = ((reqs ?? []) as { id: string; document_id: string; signer_email: string; expires_at: string; created_at: string }[])
      .filter((r) => r.signer_email.toLowerCase() === u.email.toLowerCase() && new Date(r.expires_at).getTime() > Date.now())
      .map((r) => ({ id: r.id, title: docTitle.get(r.document_id) ?? "Document", sentAt: r.created_at }));
  }

  const status = realEstate ? closingStages(m as { status: string; created_at: string; key_dates?: never }) : null;
  return {
    firm,
    matter: {
      id: m.id as string,
      title: m.title as string,
      number: (m.matter_number as string | null) ?? null,
      kind: realEstate ? (sale ? "Sale" : code === "REF" ? "Refinance" : "Purchase") : ((m.category as string | null) ?? "Matter"),
      status: m.status as string,
    },
    closing: status,
    facts: [
      { label: "Property address", value: v(details, "property") },
      { label: "File number", value: (m.matter_number as string | null) ?? "" },
      { label: "File opened", value: String(m.created_at).slice(0, 10) },
      { label: "Estimated closing date", value: status?.closingDate ?? "" },
      { label: "Purchase price", value: v(details, "price") },
      { label: "Mortgage amount", value: v(details, "mortgageAmount") },
    ].filter((f) => realEstate || !["Purchase price", "Mortgage amount", "Estimated closing date"].includes(f.label)),
    parties,
    toSign,
  };
}

// Opens a document waiting for this client's signature (a portal-only signing link).
export async function portalSignLink(requestId: unknown) {
  const u = await currentPortalUser();
  if (!uuid(requestId)) throw new PortalError(404, "Not found.");
  const { data: r } = await db().from("signature_requests").select("id, org_id, document_id, signer_email, status, expires_at").eq("id", requestId).eq("org_id", u.org_id).maybeSingle();
  if (!r || String(r.signer_email).toLowerCase() !== u.email.toLowerCase()) throw new PortalError(404, "Not found.");
  if (!["sent", "viewed"].includes(r.status as string) || new Date(r.expires_at as string).getTime() < Date.now()) throw new PortalError(410, "This signature request is no longer open.");
  const { data: d } = await db().from("documents").select("matter_id").eq("id", r.document_id).maybeSingle();
  if (!d?.matter_id) throw new PortalError(404, "Not found.");
  await clientMatterRow(d.matter_id); // the document is on one of this client's matters
  return { url: `/sign/${await portalSigningToken(r.id as string)}` };
}
