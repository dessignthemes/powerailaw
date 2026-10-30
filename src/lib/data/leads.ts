import "server-only";
import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewLead } from "@/lib/data/notifications";
import { APP_URL } from "@/lib/email/send";
import { LEAD_STATUSES, type Lead, type LeadStatus, type LeadForm } from "@/lib/leads";

// Potential leads: prospective clients who filled in the firm's intake form (on
// the firm's website, or from a link the firm sent them). A lead is imported
// into a new client card once the firm takes them on.

export class LeadError extends Error {
  constructor(public status: 400 | 404 | 429 | 503, message: string, public code?: string) {
    super(message);
  }
}

export function leadFail(where: string, e: unknown) {
  if (e instanceof LeadError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

const db = () => createAdminClient();
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /leads|intake_key/.test(e.message ?? ""));
export const setupError = () => new LeadError(503, "Potential leads need a database update first (migration 0058).", "setup");

const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const longTxt = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function toLead(r: Record<string, unknown>): Lead {
  const s = (k: string) => (r[k] as string | null) ?? "";
  return {
    id: r.id as string,
    status: (r.status as LeadStatus) ?? "new",
    source: (r.source as Lead["source"]) ?? "website",
    title: s("title"),
    firstName: s("first_name"),
    lastName: s("last_name"),
    company: s("company"),
    email: s("email"),
    phone: s("phone"),
    street: s("street"),
    city: s("city"),
    state: s("state"),
    zip: s("zip"),
    matterType: s("matter_type"),
    description: s("description"),
    otherParties: s("other_parties"),
    preferredContact: s("preferred_contact"),
    bestTime: s("best_time"),
    referredBy: s("referred_by"),
    notes: s("notes"),
    clientId: (r.client_id as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    appointmentAt: (r.appointment_at as string) ?? null,
    appointmentEnd: (r.appointment_end as string) ?? null,
    appointmentWith: (r.appointment_with as string) ?? null,
    appointmentLocation: s("appointment_location"),
    followupsSent: Number(r.followups_sent ?? 0),
    lastFollowupAt: (r.last_followup_at as string) ?? null,
    reminderSentAt: (r.reminder_sent_at as string) ?? null,
  };
}

// What a prospective client sends, cleaned.
function formColumns(b: Partial<Record<keyof LeadForm, unknown>>) {
  return {
    title: txt(b.title, 20),
    first_name: txt(b.firstName, 80),
    last_name: txt(b.lastName, 80),
    company: txt(b.company, 160),
    email: txt(b.email, 200).toLowerCase(),
    phone: txt(b.phone, 40),
    street: txt(b.street, 200),
    city: txt(b.city, 100),
    state: txt(b.state, 40),
    zip: txt(b.zip, 20),
    matter_type: txt(b.matterType, 80),
    description: longTxt(b.description, 5000),
    other_parties: longTxt(b.otherParties, 1000),
    preferred_contact: txt(b.preferredContact, 40),
    best_time: txt(b.bestTime, 120),
    referred_by: txt(b.referredBy, 200),
  };
}

// ── Firm side ────────────────────────────────────────────────────────────────

export async function intakeLink(orgId: string): Promise<{ key: string; url: string }> {
  const s = db();
  const { data, error } = await s.from("organizations").select("intake_key").eq("id", orgId).maybeSingle();
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  let key = (data as { intake_key?: string | null } | null)?.intake_key ?? null;
  if (!key) {
    key = randomBytes(9).toString("hex");
    const { error: e2 } = await s.from("organizations").update({ intake_key: key }).eq("id", orgId);
    if (e2) throw e2;
  }
  return { key, url: `${APP_URL}/intake/${key}` };
}

export async function listLeads(orgId: string): Promise<Lead[]> {
  const { data, error } = await db().from("leads").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1000);
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  return (data ?? []).map((r) => toLead(r));
}

export async function getLead(orgId: string, id: string): Promise<Lead> {
  const { data, error } = await db().from("leads").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  if (!data) throw new LeadError(404, "That lead wasn't found.");
  return toLead(data);
}

// The firm's changes: status, its own notes, the client card it became, or a correction.
export async function updateLead(orgId: string, id: string, b: Record<string, unknown>): Promise<Lead> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!(LEAD_STATUSES as readonly string[]).includes(String(b.status))) throw new LeadError(400, "Unknown status.");
    patch.status = b.status;
  }
  if (b.notes !== undefined) patch.notes = longTxt(b.notes, 4000);
  if (b.clientId !== undefined) patch.client_id = typeof b.clientId === "string" && /^[0-9a-f-]{36}$/i.test(b.clientId) ? b.clientId : null;
  if (b.form && typeof b.form === "object") Object.assign(patch, formColumns(b.form as Record<string, unknown>));
  const { data, error } = await db().from("leads").update(patch).eq("org_id", orgId).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  if (!data) throw new LeadError(404, "That lead wasn't found.");
  return toLead(data);
}

export async function deleteLead(orgId: string, id: string) {
  const { error } = await db().from("leads").delete().eq("org_id", orgId).eq("id", id);
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
}

// A lead entered by the firm (a phone call), or an invitation: a personal link
// for one prospective client, whose answers then fill in this lead.
export async function createLead(orgId: string, userId: string, b: Record<string, unknown>, invite: boolean): Promise<{ lead: Lead; url: string | null }> {
  const cols = formColumns((b.form && typeof b.form === "object" ? b.form : b) as Record<string, unknown>);
  if (cols.email && !EMAIL.test(cols.email)) throw new LeadError(400, "Check the email address.");
  if (invite && !cols.email) throw new LeadError(400, "Enter the email address to send the link to.");
  if (!invite && !cols.first_name && !cols.last_name && !cols.company) throw new LeadError(400, "Enter a name.");
  const token = invite ? randomBytes(18).toString("base64url") : null;
  const { data, error } = await db()
    .from("leads")
    .insert({ org_id: orgId, ...cols, status: invite ? "invited" : "new", source: invite ? "link" : "manual", invite_token: token, created_by: userId, submitted_at: invite ? null : new Date().toISOString() })
    .select("*")
    .single();
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
  const url = invite ? `${(await intakeLink(orgId)).url}?invite=${token}` : null;
  return { lead: toLead(data), url };
}

// The personal link of an invited lead (to send it again).
export async function inviteUrl(orgId: string, id: string): Promise<string> {
  const { data, error } = await db().from("leads").select("invite_token").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  let token = (data as { invite_token?: string | null } | null)?.invite_token ?? null;
  if (!data) throw new LeadError(404, "That lead wasn't found.");
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await db().from("leads").update({ invite_token: token }).eq("org_id", orgId).eq("id", id);
  }
  return `${(await intakeLink(orgId)).url}?invite=${token}`;
}

// ── Public side (the intake form) ────────────────────────────────────────────

export type PublicFirm = { orgId: string; name: string; logoUrl: string | null };

export async function firmByKey(key: string): Promise<PublicFirm | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return null;
  const { data, error } = await db().from("organizations").select("id, name, logo_url").eq("intake_key", key).maybeSingle();
  if (error || !data) return null;
  const r = data as { id: string; name: string | null; logo_url?: string | null };
  return { orgId: r.id, name: r.name || "Our firm", logoUrl: r.logo_url && /^https:\/\//.test(r.logo_url) ? r.logo_url : null };
}

// What the firm already knows about an invited person (to start the form with).
export async function invitePrefill(orgId: string, token: string | null): Promise<Partial<LeadForm> | null> {
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await db().from("leads").select("*").eq("org_id", orgId).eq("invite_token", token).maybeSingle();
  if (!data) return null;
  const l = toLead(data);
  return { firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone, company: l.company };
}

export const ipHash = (ip: string, orgId: string) => createHash("sha256").update(`${orgId}:${ip}:lawpower-intake`).digest("hex").slice(0, 32);

export async function submitIntake(firm: PublicFirm, body: Record<string, unknown>, ip: string): Promise<string | null> {
  // Spam guards: a field people never see, and a form filled in faster than a person could.
  if (txt(body.website, 200)) return null; // pretend it worked
  const started = Number(body.startedAt);
  if (Number.isFinite(started) && Date.now() - started < 2500) return null;
  const cols = formColumns(body as Record<string, unknown>);
  if (!cols.first_name && !cols.last_name && !cols.company) throw new LeadError(400, "Please enter your name.");
  if (!cols.email && !cols.phone) throw new LeadError(400, "Please enter an email address or a phone number so we can reach you.");
  if (cols.email && !EMAIL.test(cols.email)) throw new LeadError(400, "Please check your email address.");
  const s = db();
  const hash = ipHash(ip, firm.orgId);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await s.from("leads").select("id", { count: "exact", head: true }).eq("org_id", firm.orgId).eq("ip_hash", hash).gte("created_at", since);
  if ((count ?? 0) >= 5) throw new LeadError(429, "Thank you. We've already received several forms from you in the last hour; we'll be in touch.");

  const now = new Date().toISOString();
  const token = typeof body.invite === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.invite) ? body.invite : null;
  let leadId: string | null = null;
  if (token) {
    // A personal link: fill in that lead (once it's turned into a client, start a new one).
    const { data } = await s
      .from("leads")
      .update({ ...cols, status: "new", submitted_at: now, updated_at: now, ip_hash: hash })
      .eq("org_id", firm.orgId)
      .eq("invite_token", token)
      .in("status", ["invited", "new", "contacted"])
      .select("id")
      .maybeSingle();
    leadId = (data as { id: string } | null)?.id ?? null;
  }
  if (!leadId) {
    const { data, error } = await s
      .from("leads")
      .insert({ org_id: firm.orgId, ...cols, status: "new", source: token ? "link" : "website", submitted_at: now, ip_hash: hash })
      .select("id")
      .single();
    if (error) {
      if (missing(error)) throw setupError();
      throw error;
    }
    leadId = (data as { id: string }).id;
  }
  const name = [cols.first_name, cols.last_name].filter(Boolean).join(" ") || cols.company;
  await notifyNewLead({ orgId: firm.orgId, leadId, name, matterType: cols.matter_type });
  return leadId;
}
