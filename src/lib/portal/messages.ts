import "server-only";
import { notifyPortalMessage } from "@/lib/data/notifications";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg, newStoragePath, createUploadUrl, createDocumentFromUpload, DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { fileTypeFromName, MAX_DOCUMENT_BYTES, type FileType } from "@/lib/documents/fileTypes";
import { currentPortalUser, logEvent, firmName, PortalError } from "@/lib/portal/server";
import { accessibleMatter, accessibleMatterIds, partyRole, type PortalPerson } from "@/lib/portal/parties";

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
  direction: "firm" | "client" | "party";
  body: string;
  senderName: string;
  readAt: string | null;
  createdAt: string;
  attachments: PortalAttachment[];
  // Which conversation: 'client' (client <-> firm), 'shared' (everyone on the file) or 'party' (one realtor <-> firm).
  thread: "client" | "shared" | "party";
  partyId: string | null;
};

type Row = {
  id: string;
  matter_id: string | null;
  direction: "firm" | "client" | "party";
  body: string;
  sender_name: string;
  read_at: string | null;
  created_at: string;
  document_ids: string[] | null;
  thread?: "client" | "shared" | "party" | null;
  party_user_id?: string | null;
  client_id?: string | null;
};

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
    thread: r.thread ?? "client",
    partyId: r.party_user_id ?? null,
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
  const unread = rows.filter((r) => r.direction !== "firm" && !r.read_at).map((r) => r.id);
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
    .neq("direction", "firm")
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

// thread: 'client' (default), 'shared' (client and invited parties) or 'party' (with partyId).
export async function sendPortalMessage(matterId: string, input: { body?: unknown; documentIds?: unknown; thread?: unknown; partyId?: unknown }) {
  const { orgId, user, matter } = await ownMatter(matterId);
  const thread = input.thread === "shared" || input.thread === "party" ? input.thread : "client";
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 20000) : "";
  const docIds = (Array.isArray(input.documentIds) ? input.documentIds : []).filter(uuid).slice(0, 25) as string[];
  if (!body && !docIds.length) throw new PortalError(400, "Write a message or attach a document.");

  let access: { status: string } = { status: "active" };
  let partyId: string | null = null;
  if (thread === "party") {
    if (!uuid(input.partyId)) throw new PortalError(400, "Choose who this is for.");
    const { data: pa } = await db().from("portal_matter_access").select("portal_user_id").eq("matter_id", matter.id).eq("portal_user_id", input.partyId).maybeSingle();
    if (!pa) throw new PortalError(404, "That person doesn't have access to this file.");
    partyId = input.partyId as string;
  } else if (thread === "client") {
    if (!matter.client_id) throw new PortalError(400, "Link this matter to a client first.");
    const { data: ca, error: ae } = await db().from("client_portal_users").select("id, status").eq("client_id", matter.client_id).maybeSingle();
    if (ae) throw ae;
    if (!ca || ca.status === "disabled") throw new PortalError(409, "This client doesn't have portal access yet. Invite them first.", "not_invited");
    access = { status: ca.status as string };
  }

  // Attached documents must belong to this matter; they become visible in the portal.
  if (docIds.length) {
    const { data: docs } = await db().from("documents").select("id").eq("org_id", orgId).eq("matter_id", matter.id).in("id", docIds);
    if ((docs ?? []).length !== docIds.length) throw new PortalError(400, "Only documents on this matter can be attached.");
    // In the client's or the shared thread the client sees them; in a party's private thread only that party (through the message).
    if (thread !== "party") {
      const { error } = await db().from("documents").update({ portal_shared: true, portal_shared_at: new Date().toISOString() }).eq("org_id", orgId).in("id", docIds);
      if (error) throw error;
    }
  }
  const { data: me } = await db().from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const senderName = ((me?.full_name as string | undefined) || (me?.email as string | undefined) || user.email || "Your attorney").slice(0, 120);
  const { data, error } = await db()
    .from("portal_messages")
    .insert({
      org_id: orgId,
      client_id: matter.client_id,
      matter_id: matter.id,
      direction: "firm",
      body,
      document_ids: docIds,
      sender_user_id: user.id,
      sender_name: senderName,
      ...(thread !== "client" ? { thread, party_user_id: partyId } : {}),
    })
    .select("*")
    .single();
  if (error) throw missing(error) ? setup() : error;
  return { message: (await withAttachments(orgId, [data as Row]))[0], firm: await firmName(orgId), accessStatus: access.status };
}

// ── Client side (signed in to the portal) ─────────────────────────────────

export async function portalMessages() {
  const u = await currentPortalUser();
  // A client: their private thread and the shared threads of their files.
  // A realtor / party: their own thread and the shared threads of the files they were invited to.
  const matterIds = await accessibleMatterIds(u);
  const mine =
    u.kind === "party"
      ? db().from("portal_messages").select("*").eq("org_id", u.org_id).eq("thread", "party").eq("party_user_id", u.id)
      : db().from("portal_messages").select("*").eq("org_id", u.org_id).eq("client_id", u.client_id ?? "").or("thread.is.null,thread.eq.client");
  const [own, shared] = await Promise.all([
    mine.order("created_at").limit(1000),
    matterIds.length
      ? db().from("portal_messages").select("*").eq("org_id", u.org_id).eq("thread", "shared").in("matter_id", matterIds).order("created_at").limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  let error = own.error;
  let ownRows = own.data;
  if (error && u.kind !== "party" && /thread/.test(error.message ?? "")) {
    // Before 0043 (no thread column): every message is the client's own.
    const r = await db().from("portal_messages").select("*").eq("org_id", u.org_id).eq("client_id", u.client_id ?? "").order("created_at").limit(1000);
    error = r.error;
    ownRows = r.data;
  }
  if (error) throw missing(error) ? setup() : error;
  const rows = ([...(ownRows ?? []), ...((shared.error ? [] : shared.data) ?? [])] as Row[]).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const unread = rows.filter((r) => r.direction === "firm" && !r.read_at && (r.thread ?? "client") !== "shared");
  if (unread.length) {
    await db().from("portal_messages").update({ read_at: new Date().toISOString() }).in("id", unread.map((r) => r.id));
    await logEvent(u, "message_read");
  }
  // Which messages the signed-in person sent (in the shared thread, others' show their name).
  const mineOf = (r: Row) => (u.kind === "party" ? r.direction === "party" && r.party_user_id === u.id : r.direction === "client");
  const out = await withAttachments(u.org_id, rows);
  return { messages: out.map((m, i) => ({ ...m, mine: mineOf(rows[i]) })), newCount: unread.length };
}

// ── Client uploads ────────────────────────────────────────────────────────
// Files a client may send: documents and photos/scans.
export const CLIENT_UPLOAD_TYPES: FileType[] = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "png", "jpg"];
const MAX_UPLOADS_PER_DAY = 60;

// A ticket ties an upload slot to the client who asked for it, so a reply can
// only attach files that client just uploaded (never an existing file's path).
const ticketKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PORTAL_SECRET || "";
function ticketFor(portalUserId: string, path: string) {
  return createHmac("sha256", ticketKey()).update(`portal-upload:${portalUserId}:${path}`).digest("base64url");
}
function validTicket(portalUserId: string, path: string, ticket: unknown) {
  if (typeof ticket !== "string" || !ticketKey()) return false;
  const a = Buffer.from(ticket);
  const b = Buffer.from(ticketFor(portalUserId, path));
  return a.length === b.length && timingSafeEqual(a, b);
}

const clientMatter = (u: PortalPerson, matterId: unknown) => accessibleMatter(u, matterId);

// Step 1: a one-time link the browser uploads the file to (straight to storage).
export async function portalUploadUrl(input: { matterId?: unknown; name?: unknown; size?: unknown }) {
  const u = await currentPortalUser();
  const matterId = await clientMatter(u, input.matterId);
  const name = typeof input.name === "string" ? input.name.slice(0, 200) : "";
  const type = fileTypeFromName(name);
  if (!type || !CLIENT_UPLOAD_TYPES.includes(type)) throw new PortalError(400, `"${name || "This file"}" can't be sent. Use PDF, Word, Excel, text, JPG or PNG.`);
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) throw new PortalError(400, `"${name}" is empty.`);
  if (size > MAX_DOCUMENT_BYTES) throw new PortalError(400, `"${name}" is larger than 25 MB.`);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("client_portal_events").select("id", { count: "exact", head: true }).eq("portal_user_id", u.id).eq("type", "uploaded").gte("at", since);
  if ((count ?? 0) >= MAX_UPLOADS_PER_DAY) throw new PortalError(429, "You've sent a lot of files today. Please try again tomorrow or contact your law firm.");
  const path = newStoragePath(u.org_id, matterId, type);
  const up = await createUploadUrl(path);
  return { ...up, ticket: ticketFor(u.id, up.path) };
}

// Step 2: the reply, with the uploaded files. Each file is checked, saved to the
// matter's Documents (marked as from the client) and attached to the message.
// thread: 'private' (default: the client's or the party's own thread with the firm) or 'shared'.
export async function portalReply(input: { matterId?: unknown; body?: unknown; uploads?: unknown; thread?: unknown }) {
  const u = await currentPortalUser();
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 20000) : "";
  const uploads = (Array.isArray(input.uploads) ? input.uploads : [])
    .slice(0, 10)
    .map((x) => x as { path?: unknown; name?: unknown; ticket?: unknown })
    .filter((x) => typeof x.path === "string" && typeof x.name === "string") as { path: string; name: string; ticket?: unknown }[];
  if (!body && !uploads.length) throw new PortalError(400, "Write your message or attach a file first.");
  let matterId: string | null = null;
  if (uuid(input.matterId)) matterId = await clientMatter(u, input.matterId);
  if (uploads.length && !matterId) throw new PortalError(400, "Choose which matter these files are for.");
  const shared = input.thread === "shared";
  if (shared && !matterId) throw new PortalError(400, "Choose which file this is for.");
  let clientName: string;
  if (u.kind === "party") {
    if (!matterId) throw new PortalError(400, "Choose which file this is for.");
    const role = await partyRole(u, matterId);
    clientName = `${u.display_name || u.email}${role ? ` (${role})` : ""}`.slice(0, 120);
  } else {
    const { data: client } = await db().from("clients").select("name").eq("id", u.client_id ?? "").maybeSingle();
    clientName = ((client?.name as string | undefined) ?? u.email).slice(0, 120);
  }

  const docIds: string[] = [];
  const failed: string[] = [];
  for (const f of uploads) {
    // Only files this client uploaded just now, into a slot nothing else uses.
    if (!validTicket(u.id, f.path, f.ticket)) {
      failed.push(f.name);
      continue;
    }
    const { count: used } = await db().from("document_versions").select("id", { count: "exact", head: true }).eq("storage_path", f.path);
    if (used) {
      failed.push(f.name);
      continue;
    }
    try {
      const doc = await createDocumentFromUpload({
        orgId: u.org_id,
        matterId: matterId!,
        userId: null,
        userEmail: `${u.email} (client portal)`,
        title: f.name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 200),
        path: f.path,
        note: `Uploaded by ${clientName} through the client portal`,
      });
      // The client can see what they (or, in the shared thread, a realtor) sent; a realtor's private
      // upload stays between them and the firm. The firm sees it came through the portal.
      const visible = u.kind !== "party" || shared ? { portal_shared: true, portal_shared_at: new Date().toISOString() } : {};
      const { error: fe } = await db().from("documents").update({ ...visible, from_client: true }).eq("id", doc.id);
      if (fe && Object.keys(visible).length) await db().from("documents").update(visible).eq("id", doc.id); // before 0030: no from_client column
      docIds.push(doc.id);
      await logEvent(u, "uploaded", doc.title);
    } catch (e) {
      console.error("Client portal upload rejected:", (e as Error)?.message);
      await db().storage.from(DOCUMENTS_BUCKET).remove([f.path]).catch(() => null);
      failed.push(f.name);
    }
  }
  if (!body && !docIds.length) throw new PortalError(400, `${failed.join(", ")} couldn't be read. Please check the file and try again.`);

  const { data, error } = await db()
    .from("portal_messages")
    .insert({
      org_id: u.org_id,
      client_id: u.kind === "party" ? null : u.client_id,
      matter_id: matterId,
      direction: u.kind === "party" ? "party" : "client",
      body,
      document_ids: docIds,
      sender_name: clientName,
      // A party's message keeps who sent it, in the shared thread too.
      ...(shared ? { thread: "shared", party_user_id: u.kind === "party" ? u.id : null } : u.kind === "party" ? { thread: "party", party_user_id: u.id } : {}),
    })
    .select("*")
    .single();
  if (error) throw missing(error) ? setup() : error;
  await logEvent(u, "replied");
  // The firm hears about it: bell alert (dashboard), Inbox panel and the matter's badge.
  await notifyPortalMessage({ orgId: u.org_id, matterId, clientId: u.client_id ?? u.id, fromName: clientName, preview: body || `Sent ${docIds.length} file${docIds.length === 1 ? "" : "s"}` });
  return { message: (await withAttachments(u.org_id, [data as Row]))[0], failed };
}

// Firm side, for the Inbox: recent messages clients sent through the portal (newest first).
export async function recentPortalMessages() {
  const { orgId } = await requireUserOrg();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await db()
    .from("portal_messages")
    .select("id, client_id, matter_id, body, document_ids, sender_name, read_at, created_at")
    .eq("org_id", orgId)
    .neq("direction", "firm")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) return { messages: [], unread: 0 };
  const rows = (data ?? []) as { id: string; client_id: string; matter_id: string | null; body: string; document_ids: string[]; sender_name: string; read_at: string | null; created_at: string }[];
  const matterIds = [...new Set(rows.map((r) => r.matter_id).filter((x): x is string => !!x))];
  const { data: ms } = matterIds.length ? await db().from("matters").select("id, title, matter_number").in("id", matterIds) : { data: [] };
  const matters = new Map(((ms ?? []) as { id: string; title: string; matter_number: string | null }[]).map((m) => [m.id, m]));
  return {
    unread: rows.filter((r) => !r.read_at).length,
    messages: rows.map((r) => ({
      id: r.id,
      from: r.sender_name || "Client",
      clientId: r.client_id,
      matterId: r.matter_id,
      matter: r.matter_id ? (matters.get(r.matter_id)?.matter_number || matters.get(r.matter_id)?.title || "Matter") : null,
      preview: (r.body || (r.document_ids?.length ? `Sent ${r.document_ids.length} file${r.document_ids.length === 1 ? "" : "s"}` : "")).slice(0, 160),
      unread: !r.read_at,
      at: r.created_at,
    })),
  };
}
