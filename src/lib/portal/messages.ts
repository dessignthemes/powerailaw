import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg } from "@/lib/data/documents";
import { currentPortalUser, logEvent, firmName, PortalError } from "@/lib/portal/server";

// Secure messages through the client portal (0029_portal_messages.sql). The
// message and its documents never travel by email; the client reads them after
// signing in to the portal, and replies there.

const db = () => createAdminClient();
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /portal_messages/.test(e.message ?? ""));
const setup = () => new PortalError(503, "Secure messages need a database update. Run supabase/migrations/0029_portal_messages.sql in the Supabase SQL editor.", "setup_required");
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export type PortalAttachment = { id: string; title: string; versionId: string | null; fileType: string };
export type PortalMessage = {
  id: string;
  matterId: string | null;
  direction: "firm" | "client";
  body: string;
  senderName: string;
  readAt: string | null;
  createdAt: string;
  attachments: PortalAttachment[];
};

type Row = { id: string; matter_id: string | null; direction: "firm" | "client"; body: string; sender_name: string; read_at: string | null; created_at: string; document_ids: string[] | null };

// Titles and newest versions of the attached documents (only ones still shared).
async function withAttachments(orgId: string, rows: Row[]): Promise<PortalMessage[]> {
  const ids = [...new Set(rows.flatMap((r) => r.document_ids ?? []))];
  const docs = new Map<string, PortalAttachment & { shared: boolean }>();
  if (ids.length) {
    const { data } = await db()
      .from("documents")
      .select("id, title, portal_shared, document_versions(id, version_number, file_type)")
      .eq("org_id", orgId)
      .in("id", ids);
    for (const d of (data ?? []) as unknown as { id: string; title: string; portal_shared: boolean; document_versions: { id: string; version_number: number; file_type: string | null }[] }[]) {
      const v = [...(d.document_versions ?? [])].sort((a, b) => b.version_number - a.version_number)[0];
      docs.set(d.id, { id: d.id, title: d.title, versionId: v?.id ?? null, fileType: v?.file_type ?? "pdf", shared: d.portal_shared });
    }
  }
  return rows.map((r) => ({
    id: r.id,
    matterId: r.matter_id,
    direction: r.direction,
    body: r.body,
    senderName: r.sender_name,
    readAt: r.read_at,
    createdAt: r.created_at,
    attachments: (r.document_ids ?? []).map((id) => docs.get(id)).filter((d): d is PortalAttachment & { shared: boolean } => !!d).map(({ shared: _s, ...a }) => (void _s, a)),
  }));
}

// ── Firm side ─────────────────────────────────────────────────────────────

async function ownMatter(matterId: string) {
  const ctx = await requireUserOrg();
  if (!uuid(matterId)) throw new PortalError(404, "Matter not found.");
  const { data } = await db().from("matters").select("id, title, client_id").eq("id", matterId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new PortalError(404, "Matter not found.");
  return { ...ctx, matter: data as { id: string; title: string; client_id: string | null } };
}

// The matter's secure messages, oldest first. Opening them marks the client's replies read.
export async function listMatterPortalMessages(matterId: string) {
  const { orgId, matter } = await ownMatter(matterId);
  const { data, error } = await db().from("portal_messages").select("*").eq("org_id", orgId).eq("matter_id", matter.id).order("created_at").limit(500);
  if (error) throw missing(error) ? setup() : error;
  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => r.direction === "client" && !r.read_at).map((r) => r.id);
  if (unread.length) await db().from("portal_messages").update({ read_at: new Date().toISOString() }).in("id", unread);
  const { data: access } = matter.client_id
    ? await db().from("client_portal_users").select("email, status, last_login_at").eq("client_id", matter.client_id).maybeSingle()
    : { data: null };
  return {
    messages: await withAttachments(orgId, rows),
    unreadFromClient: unread.length,
    access: access ? { email: access.email as string, status: access.status as string, lastLoginAt: (access.last_login_at as string | null) ?? null } : null,
    hasClient: !!matter.client_id,
  };
}

// Unread client replies for each matter (badge on the Emails tab).
export async function unreadPortalReplies(matterId: string) {
  const { orgId } = await ownMatter(matterId);
  const { count, error } = await db()
    .from("portal_messages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("matter_id", matterId)
    .eq("direction", "client")
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function sendPortalMessage(matterId: string, input: { body?: unknown; documentIds?: unknown }) {
  const { orgId, user, matter } = await ownMatter(matterId);
  if (!matter.client_id) throw new PortalError(400, "Link this matter to a client first.");
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 20000) : "";
  const docIds = (Array.isArray(input.documentIds) ? input.documentIds : []).filter(uuid).slice(0, 25) as string[];
  if (!body && !docIds.length) throw new PortalError(400, "Write a message or attach a document.");

  const { data: access, error: ae } = await db().from("client_portal_users").select("id, status").eq("client_id", matter.client_id).maybeSingle();
  if (ae) throw ae;
  if (!access || access.status === "disabled") throw new PortalError(409, "This client doesn't have portal access yet. Invite them first.", "not_invited");

  // Attached documents must belong to this matter; they become visible in the portal.
  if (docIds.length) {
    const { data: docs } = await db().from("documents").select("id").eq("org_id", orgId).eq("matter_id", matter.id).in("id", docIds);
    if ((docs ?? []).length !== docIds.length) throw new PortalError(400, "Only documents on this matter can be attached.");
    const { error } = await db().from("documents").update({ portal_shared: true, portal_shared_at: new Date().toISOString() }).eq("org_id", orgId).in("id", docIds);
    if (error) throw error;
  }
  const { data: me } = await db().from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const senderName = ((me?.full_name as string | undefined) || (me?.email as string | undefined) || user.email || "Your attorney").slice(0, 120);
  const { data, error } = await db()
    .from("portal_messages")
    .insert({ org_id: orgId, client_id: matter.client_id, matter_id: matter.id, direction: "firm", body, document_ids: docIds, sender_user_id: user.id, sender_name: senderName })
    .select("*")
    .single();
  if (error) throw missing(error) ? setup() : error;
  return { message: (await withAttachments(orgId, [data as Row]))[0], firm: await firmName(orgId), accessStatus: access.status as string };
}

// ── Client side (signed in to the portal) ─────────────────────────────────

export async function portalMessages() {
  const u = await currentPortalUser();
  const { data, error } = await db().from("portal_messages").select("*").eq("org_id", u.org_id).eq("client_id", u.client_id).order("created_at").limit(1000);
  if (error) throw missing(error) ? setup() : error;
  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => r.direction === "firm" && !r.read_at);
  if (unread.length) {
    await db().from("portal_messages").update({ read_at: new Date().toISOString() }).in("id", unread.map((r) => r.id));
    await logEvent(u, "message_read");
  }
  return { messages: await withAttachments(u.org_id, rows), newCount: unread.length };
}

export async function portalReply(input: { matterId?: unknown; body?: unknown }) {
  const u = await currentPortalUser();
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 20000) : "";
  if (!body) throw new PortalError(400, "Write your message first.");
  let matterId: string | null = null;
  if (uuid(input.matterId)) {
    const { data } = await db().from("matters").select("id").eq("id", input.matterId as string).eq("org_id", u.org_id).eq("client_id", u.client_id).maybeSingle();
    if (!data) throw new PortalError(404, "Matter not found.");
    matterId = data.id as string;
  }
  const { data: client } = await db().from("clients").select("name").eq("id", u.client_id).maybeSingle();
  const { data, error } = await db()
    .from("portal_messages")
    .insert({ org_id: u.org_id, client_id: u.client_id, matter_id: matterId, direction: "client", body, sender_name: ((client?.name as string | undefined) ?? u.email).slice(0, 120) })
    .select("*")
    .single();
  if (error) throw missing(error) ? setup() : error;
  await logEvent(u, "replied");
  return (await withAttachments(u.org_id, [data as Row]))[0];
}
