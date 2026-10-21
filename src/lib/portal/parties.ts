import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg } from "@/lib/data/documents";
import { firmName, logEvent, PortalError } from "@/lib/portal/server";

// Realtors and other parties in the client portal: invited to specific matters,
// they see those matters' pages, the shared thread and their own private thread.

const db = () => createAdminClient();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const INVITE_DAYS = 14;
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || e.code === "42703" || /portal_matter_access|kind|display_name/.test(e.message ?? ""));
const setup = () => new PortalError(503, "Realtor access needs a database update. Run supabase/migrations/0043_portal_parties.sql in the Supabase SQL editor.", "setup_required");

export const PARTY_ROLES = ["Buyer's realtor", "Seller's realtor", "Lender", "Title company", "Other"] as const;

export type PortalPerson = { id: string; org_id: string; client_id: string | null; email: string; kind?: string | null; display_name?: string | null };

// ── Which matters a portal user can see ───────────────────────────────────
export async function accessibleMatterIds(u: PortalPerson): Promise<string[]> {
  if (u.kind === "party") {
    const { data } = await db().from("portal_matter_access").select("matter_id").eq("org_id", u.org_id).eq("portal_user_id", u.id);
    return ((data ?? []) as { matter_id: string }[]).map((r) => r.matter_id);
  }
  if (!u.client_id) return [];
  // Their own matters, plus matters they were linked to as a contact (e.g. co-client)
  // where the firm turned on "can see this matter in their client portal".
  const [{ data }, linked] = await Promise.all([
    db().from("matters").select("id").eq("org_id", u.org_id).eq("client_id", u.client_id),
    db().from("matter_contacts").select("matter_id").eq("org_id", u.org_id).eq("client_id", u.client_id).eq("portal_access", true),
  ]);
  const own = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const extra = linked.error ? [] : ((linked.data ?? []) as { matter_id: string }[]).map((r) => r.matter_id); // before 0047/0048: none
  return [...new Set([...own, ...extra])];
}

export async function accessibleMatter(u: PortalPerson, matterId: unknown): Promise<string> {
  if (!uuid(matterId)) throw new PortalError(400, "Choose which file this is for.");
  if (!(await accessibleMatterIds(u)).includes(matterId)) throw new PortalError(404, "Matter not found.");
  return matterId;
}

export async function partyRole(u: PortalPerson, matterId: string): Promise<string | null> {
  if (u.kind !== "party") return null;
  const { data } = await db().from("portal_matter_access").select("role").eq("portal_user_id", u.id).eq("matter_id", matterId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

// ── Firm side ─────────────────────────────────────────────────────────────
async function ownMatter(matterId: string) {
  const ctx = await requireUserOrg();
  if (!uuid(matterId)) throw new PortalError(404, "Matter not found.");
  const { data } = await db().from("matters").select("id, title").eq("id", matterId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new PortalError(404, "Matter not found.");
  return { ...ctx, matter: data as { id: string; title: string } };
}

export async function listParties(matterId: string) {
  const { orgId } = await ownMatter(matterId);
  const { data, error } = await db()
    .from("portal_matter_access")
    .select("id, role, created_at, client_portal_users!inner(id, email, display_name, status, last_login_at)")
    .eq("org_id", orgId)
    .eq("matter_id", matterId)
    .order("created_at");
  if (error) throw missing(error) ? setup() : error;
  return ((data ?? []) as unknown as { id: string; role: string; client_portal_users: { id: string; email: string; display_name: string; status: string; last_login_at: string | null } }[]).map((r) => ({
    accessId: r.id,
    partyId: r.client_portal_users.id,
    name: r.client_portal_users.display_name || r.client_portal_users.email,
    email: r.client_portal_users.email,
    role: r.role,
    status: r.client_portal_users.status,
    lastLoginAt: r.client_portal_users.last_login_at,
  }));
}

// Invites a realtor (or other party) to this matter. The same person invited to
// several matters keeps one login. Returns the invite link token.
export async function inviteParty(matterId: string, input: { name?: unknown; email?: unknown; role?: unknown }) {
  const { orgId, user: me, matter } = await ownMatter(matterId);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  const name = String(input.name ?? "").trim().slice(0, 120);
  const role = String(input.role ?? "").trim().slice(0, 60) || "Realtor";
  if (!validEmail(email)) throw new PortalError(400, "Enter their email address.");
  if (!name) throw new PortalError(400, "Enter their name.");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const inviteFields = {
    invite_token_hash: sha256(token),
    invite_expires_at: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
    invited_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const { data: existing, error } = await db().from("client_portal_users").select("id, org_id, status, password_hash").eq("org_id", orgId).eq("kind", "party").ilike("email", email).maybeSingle();
  if (error) throw missing(error) ? setup() : error;
  let person: { id: string; org_id: string };
  let needsLink = true;
  if (existing) {
    // Already has a login: just add this matter (a new link only if they never set a password).
    needsLink = !existing.password_hash || existing.status !== "active";
    const { data, error: e } = await db()
      .from("client_portal_users")
      .update({ display_name: name, ...(needsLink ? { ...inviteFields, status: existing.status === "active" ? "active" : "invited" } : {}) })
      .eq("id", existing.id)
      .select("id, org_id")
      .single();
    if (e) throw e;
    person = data as { id: string; org_id: string };
  } else {
    const { data, error: e } = await db()
      .from("client_portal_users")
      .insert({ ...inviteFields, org_id: orgId, client_id: null, kind: "party", display_name: name, email, status: "invited", created_by: me.id })
      .select("id, org_id")
      .single();
    if (e) throw missing(e) ? setup() : e;
    person = data as { id: string; org_id: string };
  }
  const { error: ae } = await db()
    .from("portal_matter_access")
    .upsert({ org_id: orgId, portal_user_id: person.id, matter_id: matter.id, role, created_by: me.id }, { onConflict: "portal_user_id,matter_id" });
  if (ae) throw missing(ae) ? setup() : ae;
  await logEvent(person, "invited");
  return { token: needsLink ? token : null, email, name, role, firm: await firmName(orgId), matterTitle: matter.title };
}

export async function removeParty(matterId: string, accessId: string) {
  const { orgId } = await ownMatter(matterId);
  if (!uuid(accessId)) throw new PortalError(404, "Not found.");
  const { error } = await db().from("portal_matter_access").delete().eq("id", accessId).eq("org_id", orgId).eq("matter_id", matterId);
  if (error) throw missing(error) ? setup() : error;
}
