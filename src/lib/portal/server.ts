import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg, AccessError, DOCUMENTS_BUCKET } from "@/lib/data/documents";

// ── Client portal ─────────────────────────────────────────────────────────
// Clients are not firm users. They have their own email + password, their own
// session cookie, and can only ever see documents the firm marked as shared on
// matters that belong to them.

export const PORTAL_MIGRATION = "0024_client_portal.sql";
export const PORTAL_COOKIE = "lp_portal";
const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export class PortalError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 503, message: string, public code?: string) {
    super(message);
  }
}

const db = () => createAdminClient();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || e.code === "42703" || /client_portal|portal_shared/.test(e.message ?? ""));
const setupError = () =>
  new PortalError(503, `The client portal needs a database update. Run supabase/migrations/${PORTAL_MIGRATION} in the Supabase SQL editor.`, "setup_required");
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw: string, stored: string | null) {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) {
    scryptSync(pw, "dummy-salt-for-timing", 32); // same work either way
    return false;
  }
  const got = scryptSync(pw, Buffer.from(salt, "hex"), 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
function checkNewPassword(pw: string) {
  if (pw.length < 8) throw new PortalError(400, "Use a password of at least 8 characters.");
  if (pw.length > 200) throw new PortalError(400, "That password is too long.");
}

type UserRow = {
  id: string; org_id: string; client_id: string; email: string; status: "invited" | "active" | "disabled"; password_hash: string | null;
  invite_expires_at: string | null; invited_at: string | null; failed_attempts: number; locked_until: string | null; last_login_at: string | null;
};

async function logEvent(u: { id: string; org_id: string }, type: string, documentTitle: string | null = null) {
  await db().from("client_portal_events").insert({ org_id: u.org_id, portal_user_id: u.id, type, document_title: documentTitle });
}
async function firmName(orgId: string) {
  const { data } = await db().from("organizations").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | undefined) ?? "Your law firm";
}

// ── Firm side ─────────────────────────────────────────────────────────────
async function ownClient(clientId: string) {
  const ctx = await requireUserOrg();
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new PortalError(404, "Client not found.");
  const { data } = await db().from("clients").select("id, name, email").eq("id", clientId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new PortalError(404, "Client not found.");
  return { ...ctx, client: data as { id: string; name: string; email: string | null } };
}

export async function portalStatus(clientId: string) {
  const { orgId, client } = await ownClient(clientId);
  const { data: u, error } = await db().from("client_portal_users").select("*").eq("client_id", client.id).maybeSingle();
  if (error) throw isMissing(error) ? setupError() : error;
  const user = u as UserRow | null;
  const { data: matters } = await db().from("matters").select("id").eq("org_id", orgId).eq("client_id", client.id);
  const ids = (matters ?? []).map((m) => m.id as string);
  const { data: shared, error: e2 } = ids.length
    ? await db().from("documents").select("id").eq("org_id", orgId).in("matter_id", ids).eq("portal_shared", true)
    : { data: [], error: null };
  if (e2) throw isMissing(e2) ? setupError() : e2;
  const { data: events } = user
    ? await db().from("client_portal_events").select("type, document_title, at").eq("portal_user_id", user.id).order("at", { ascending: false }).limit(30)
    : { data: [] };
  return {
    clientEmail: client.email,
    access: user
      ? {
          email: user.email,
          status: user.status,
          invitedAt: user.invited_at,
          inviteExpiresAt: user.invite_expires_at,
          lastLoginAt: user.last_login_at,
          hasPassword: !!user.password_hash,
        }
      : null,
    sharedDocumentIds: (shared ?? []).map((d) => d.id as string),
    events: (events ?? []).map((e) => ({ type: e.type as string, documentTitle: e.document_title as string | null, at: e.at as string })),
  };
}

// Creates (or renews) the client's invite link. Also used to reset a forgotten password.
export async function invite(clientId: string, emailInput: unknown) {
  const { orgId, user: me, client } = await ownClient(clientId);
  const email = String(emailInput ?? "").trim().toLowerCase().slice(0, 200);
  if (!validEmail(email)) throw new PortalError(400, "Enter the client’s email address.");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const fields = {
    email,
    invite_token_hash: sha256(token),
    invite_expires_at: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
    invited_at: now.toISOString(),
    failed_attempts: 0,
    locked_until: null,
    updated_at: now.toISOString(),
  };
  const { data: existing, error } = await db().from("client_portal_users").select("id, status").eq("client_id", client.id).maybeSingle();
  if (error) throw isMissing(error) ? setupError() : error;
  let row: { id: string; org_id: string };
  if (existing) {
    const status = existing.status === "disabled" ? "invited" : existing.status;
    const { data, error: e } = await db().from("client_portal_users").update({ ...fields, status }).eq("id", existing.id).select("id, org_id").single();
    if (e) throw e;
    row = data as { id: string; org_id: string };
  } else {
    const { data, error: e } = await db()
      .from("client_portal_users")
      .insert({ ...fields, org_id: orgId, client_id: client.id, status: "invited", created_by: me.id })
      .select("id, org_id")
      .single();
    if (e) throw isMissing(e) ? setupError() : e;
    row = data as { id: string; org_id: string };
  }
  await logEvent(row, "invited");
  return { token, email, expiresAt: fields.invite_expires_at, firm: await firmName(orgId), clientName: client.name };
}

export async function setAccess(clientId: string, enabled: boolean) {
  const { client } = await ownClient(clientId);
  const { data: u } = await db().from("client_portal_users").select("id, password_hash").eq("client_id", client.id).maybeSingle();
  if (!u) throw new PortalError(404, "This client hasn’t been invited yet.");
  await db()
    .from("client_portal_users")
    .update({ status: enabled ? (u.password_hash ? "active" : "invited") : "disabled", updated_at: new Date().toISOString(), ...(enabled ? {} : { invite_token_hash: null }) })
    .eq("id", u.id);
  if (!enabled) await db().from("client_portal_sessions").delete().eq("portal_user_id", u.id);
}

export async function setShared(documentId: string, shared: boolean) {
  const { orgId } = await requireUserOrg();
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new PortalError(404, "Document not found.");
  const { data: doc } = await db().from("documents").select("id, matters(client_id)").eq("id", documentId).eq("org_id", orgId).maybeSingle();
  if (!doc) throw new PortalError(404, "Document not found.");
  if (shared && !(doc as unknown as { matters: { client_id: string | null } | null }).matters?.client_id)
    throw new PortalError(400, "Link this document’s matter to a client first.");
  const { error } = await db()
    .from("documents")
    .update({ portal_shared: shared, portal_shared_at: shared ? new Date().toISOString() : null })
    .eq("id", documentId)
    .eq("org_id", orgId);
  if (error) throw isMissing(error) ? setupError() : error;
}

// ── Sessions ──────────────────────────────────────────────────────────────
async function startSession(u: UserRow) {
  const token = randomBytes(32).toString("base64url");
  await db().from("client_portal_sessions").insert({
    portal_user_id: u.id,
    org_id: u.org_id,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
  });
  await db().from("client_portal_users").update({ last_login_at: new Date().toISOString(), failed_attempts: 0, locked_until: null }).eq("id", u.id);
  (await cookies()).set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function currentPortalUser(): Promise<UserRow> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value ?? "";
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new PortalError(401, "Please sign in.", "signed_out");
  const { data: s, error } = await db().from("client_portal_sessions").select("id, portal_user_id, expires_at, last_seen_at").eq("token_hash", sha256(token)).maybeSingle();
  if (error && isMissing(error)) throw setupError();
  if (!s || new Date(s.expires_at as string) <= new Date()) throw new PortalError(401, "Your session ended. Please sign in again.", "signed_out");
  const { data: u } = await db().from("client_portal_users").select("*").eq("id", s.portal_user_id).maybeSingle();
  if (!u || u.status !== "active") throw new PortalError(401, "Your portal access is turned off. Contact your law firm.", "signed_out");
  if (Date.now() - new Date(s.last_seen_at as string).getTime() > 3_600_000)
    await db().from("client_portal_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  return u as UserRow;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value;
  if (token) await db().from("client_portal_sessions").delete().eq("token_hash", sha256(token));
  jar.delete(PORTAL_COOKIE);
}

// ── Public: invite + login ────────────────────────────────────────────────
async function byInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new PortalError(404, "This invite link isn’t valid.");
  const { data, error } = await db().from("client_portal_users").select("*").eq("invite_token_hash", sha256(token)).maybeSingle();
  if (error && isMissing(error)) throw new PortalError(404, "This invite link isn’t valid.");
  const u = data as UserRow | null;
  if (!u || u.status === "disabled") throw new PortalError(404, "This invite link isn’t valid. Ask your law firm for a new one.");
  if (!u.invite_expires_at || new Date(u.invite_expires_at) <= new Date())
    throw new PortalError(410, "This invite link has expired. Ask your law firm for a new one.");
  return u;
}

export async function inviteInfo(token: string) {
  const u = await byInvite(token);
  const { data: c } = await db().from("clients").select("name").eq("id", u.client_id).maybeSingle();
  return { firm: await firmName(u.org_id), clientName: (c?.name as string | undefined) ?? "", email: u.email, returning: !!u.password_hash };
}

export async function acceptInvite(token: string, password: unknown) {
  const u = await byInvite(token);
  const pw = String(password ?? "");
  checkNewPassword(pw);
  const { data, error } = await db()
    .from("client_portal_users")
    .update({ password_hash: hashPassword(pw), status: "active", invite_token_hash: null, invite_expires_at: null, updated_at: new Date().toISOString() })
    .eq("id", u.id)
    .select("*")
    .single();
  if (error) throw error;
  // A new password signs out every other device.
  await db().from("client_portal_sessions").delete().eq("portal_user_id", u.id);
  await logEvent(u, "joined");
  await startSession(data as UserRow);
}

export async function login(emailInput: unknown, password: unknown) {
  const email = String(emailInput ?? "").trim().toLowerCase();
  const pw = String(password ?? "");
  const generic = new PortalError(401, "That email and password don’t match. Check them, or ask your law firm for a new invite link.");
  if (!validEmail(email) || !pw) throw generic;
  const { data, error } = await db().from("client_portal_users").select("*").eq("email", email).eq("status", "active");
  if (error) throw isMissing(error) ? setupError() : error;
  const rows = (data ?? []) as UserRow[];
  if (!rows.length) {
    checkPassword(pw, null);
    throw generic;
  }
  const now = Date.now();
  if (rows.every((r) => r.locked_until && new Date(r.locked_until).getTime() > now))
    throw new PortalError(429, `Too many attempts. Try again in ${LOCK_MINUTES} minutes, or ask your law firm for a new invite link.`);
  const match = rows
    .filter((r) => !(r.locked_until && new Date(r.locked_until).getTime() > now))
    .sort((a, b) => (b.last_login_at ?? "").localeCompare(a.last_login_at ?? ""))
    .find((r) => checkPassword(pw, r.password_hash));
  if (!match) {
    for (const r of rows) {
      const n = r.failed_attempts + 1;
      await db()
        .from("client_portal_users")
        .update({ failed_attempts: n >= MAX_FAILED ? 0 : n, locked_until: n >= MAX_FAILED ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : r.locked_until })
        .eq("id", r.id);
    }
    throw generic;
  }
  await startSession(match);
  await logEvent(match, "login");
}

// ── Portal content ────────────────────────────────────────────────────────
type VersionLite = { id: string; version_number: number; size_bytes: number; file_type?: string; created_at: string };

export async function portalHome() {
  const u = await currentPortalUser();
  const [{ data: client }, firm, { data: matters }] = await Promise.all([
    db().from("clients").select("name").eq("id", u.client_id).maybeSingle(),
    firmName(u.org_id),
    db().from("matters").select("id, title, status, category, updated_at").eq("org_id", u.org_id).eq("client_id", u.client_id).order("updated_at", { ascending: false }),
  ]);
  const ids = (matters ?? []).map((m) => m.id as string);
  const { data: docs } = ids.length
    ? await db()
        .from("documents")
        .select("id, matter_id, title, portal_shared_at, document_versions(id, version_number, size_bytes, file_type, created_at)")
        .eq("org_id", u.org_id)
        .in("matter_id", ids)
        .eq("portal_shared", true)
        .order("portal_shared_at", { ascending: false })
    : { data: [] };
  const docList = ((docs ?? []) as unknown as { id: string; matter_id: string; title: string; portal_shared_at: string | null; document_versions: VersionLite[] }[])
    .map((d) => {
      const v = [...(d.document_versions ?? [])].sort((a, b) => b.version_number - a.version_number)[0];
      return v
        ? { id: d.id, matterId: d.matter_id, title: d.title, sharedAt: d.portal_shared_at, versionId: v.id, fileType: v.file_type ?? "pdf", size: Number(v.size_bytes), updatedAt: v.created_at }
        : null;
    })
    .filter((d): d is NonNullable<typeof d> => !!d);
  return {
    firm,
    clientName: (client?.name as string | undefined) ?? "",
    email: u.email,
    matters: (matters ?? []).map((m) => ({ id: m.id as string, title: m.title as string, status: m.status as string, category: (m.category as string | null) ?? null })),
    documents: docList,
  };
}

// Short-lived link to one shared file (inline preview, or download).
export async function portalFileUrl(versionId: string, download: boolean) {
  const u = await currentPortalUser();
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) throw new PortalError(404, "File not found.");
  const { data: v } = await db()
    .from("document_versions")
    .select("storage_path, version_number, documents!inner(id, title, org_id, portal_shared, matters!inner(client_id))")
    .eq("id", versionId)
    .eq("org_id", u.org_id)
    .maybeSingle();
  const doc = (v as unknown as { documents: { title: string; org_id: string; portal_shared: boolean; matters: { client_id: string | null } } } | null)?.documents;
  if (!v || !doc || !doc.portal_shared || doc.matters?.client_id !== u.client_id) throw new PortalError(404, "File not found.");
  const path = v.storage_path as string;
  const ext = path.split(".").pop() ?? "pdf";
  const name = (doc.title.replace(/[\\/:*?"<>|]+/g, "-") || "document").replace(new RegExp(`\\.${ext}$`, "i"), "") + "." + ext;
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 120, download ? { download: name } : undefined);
  if (error || !data) throw new PortalError(404, "File not found.");
  await logEvent(u, download ? "downloaded" : "viewed", doc.title);
  return data.signedUrl;
}

export function portalFail(where: string, e: unknown) {
  if (e instanceof PortalError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (isMissing(x)) return NextResponse.json({ error: setupError().message, code: "setup_required" }, { status: 503 });
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
