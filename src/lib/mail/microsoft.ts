import "server-only";
import { cidsIn, replaceCids, normalizeCid, MAX_INLINE_IMAGE, MAX_INLINE_TOTAL } from "@/lib/mail/inlineImages";
import { MailError } from "@/lib/mail/tokens";
import { fetchWithRetry, mapLimit } from "@/lib/mail/limit";
import type { FolderKind, MailFolder, MailMessage, MailPage, MailSummary } from "@/lib/mail/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

type Addr = { emailAddress?: { name?: string; address?: string } };
type GraphMsg = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: Addr;
  toRecipients?: Addr[];
  ccRecipients?: Addr[];
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  body?: { contentType?: "html" | "text"; content?: string };
  webLink?: string;
};

async function graph<T>(token: string, url: string): Promise<T> {
  const res = await fetchWithRetry(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new MailError("reconnect", "Your Outlook connection has expired. Reconnect to keep reading mail.");
  if (res.status === 403) {
    throw new MailError("missing_scope", "Outlook mail access wasn't granted. Reconnect and allow mail access.");
  }
  if (!res.ok) {
    console.error("Graph API error", res.status, await res.text().catch(() => ""));
    throw new MailError("provider_error", "Outlook didn't respond as expected. Please try again.");
  }
  return res.json() as Promise<T>;
}

const fmt = (a?: Addr) => {
  const name = a?.emailAddress?.name ?? "";
  const addr = a?.emailAddress?.address ?? "";
  return name && addr && name !== addr ? `${name} <${addr}>` : addr || name;
};

function toSummary(m: GraphMsg): MailSummary {
  return {
    id: m.id,
    threadId: m.conversationId ?? null,
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "(unknown sender)",
    fromEmail: m.from?.emailAddress?.address ?? "",
    subject: m.subject || "(no subject)",
    snippet: m.bodyPreview ?? "",
    date: m.receivedDateTime ?? new Date().toISOString(),
    unread: m.isRead === false,
    hasAttachments: !!m.hasAttachments,
  };
}

const SELECT = "id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments";

const FOLDER_ID = /^[A-Za-z0-9=+/_-]+$/;

export async function listOutlook(token: string, opts: { q?: string; pageToken?: string; folder?: string; unread?: boolean }): Promise<MailPage> {
  let url: string;
  const folder = opts.folder && FOLDER_ID.test(opts.folder) ? encodeURIComponent(opts.folder) : null;
  if (opts.pageToken) {
    // nextLink from Graph; only ever follow links back to Graph itself.
    if (!opts.pageToken.startsWith(`${GRAPH}/`)) throw new MailError("provider_error", "Invalid page token.");
    url = opts.pageToken;
  } else if (opts.q?.trim()) {
    const q = opts.q.trim().replace(/"/g, "");
    // Search within the chosen folder, or across the mailbox if none is chosen.
    url = `${folder ? `/me/mailFolders/${folder}` : "/me"}/messages?$top=25&$select=${SELECT}&$search="${encodeURIComponent(q)}"`;
  } else {
    // Unread only: Outlook returns just unread emails (search results are filtered after).
    url = `/me/mailFolders/${folder ?? "inbox"}/messages?$top=25&$select=${SELECT}${opts.unread ? "&$filter=isRead eq false" : ""}&$orderby=receivedDateTime desc`;
  }
  const data = await graph<{ value: GraphMsg[]; "@odata.nextLink"?: string }>(token, url);
  return { messages: data.value.map(toSummary), nextPageToken: data["@odata.nextLink"] ?? null };
}

async function withOutlookInlineImages(token: string, enc: string, html: string, cids: Set<string>) {
  const list = await graph<{ value: { id: string; size: number; contentType: string; isInline?: boolean }[] }>(
    token,
    `/me/messages/${enc}/attachments?$select=id,size,contentType,isInline`
  );
  const images = new Map<string, { mime: string; base64: string }>();
  let total = 0;
  for (const a of list.value) {
    if (!/^image\//i.test(a.contentType ?? "") || a.size > MAX_INLINE_IMAGE || total + a.size > MAX_INLINE_TOTAL) continue;
    const full = await graph<{ contentId?: string | null; name?: string; contentBytes?: string; contentType?: string }>(token, `/me/messages/${enc}/attachments/${encodeURIComponent(a.id)}`).catch(() => null);
    if (!full?.contentBytes) continue;
    const key = normalizeCid(full.contentId ?? "");
    const byName = normalizeCid(full.name ?? "");
    const match = cids.has(key) ? key : [...cids].find((c) => c.split("@")[0] === byName || c.split("@")[0] === key.split("@")[0]);
    if (!match) continue;
    images.set(match, { mime: full.contentType || a.contentType, base64: full.contentBytes });
    total += a.size;
  }
  return replaceCids(html, images);
}

export async function getOutlook(token: string, id: string): Promise<MailMessage> {
  if (!/^[A-Za-z0-9_=+/-]+$/.test(id)) throw new MailError("provider_error", "Invalid message id.");
  const enc = encodeURIComponent(id);
  const m = await graph<GraphMsg>(
    token,
    `/me/messages/${enc}?$select=${SELECT},toRecipients,ccRecipients,body,webLink`
  );
  let attachments: MailMessage["attachments"] = [];
  if (m.hasAttachments) {
    const a = await graph<{ value: { name: string; size: number; contentType: string; isInline?: boolean }[] }>(
      token,
      `/me/messages/${enc}/attachments?$select=name,size,contentType,isInline`
    );
    attachments = a.value.filter((x) => !x.isInline).map((x) => ({ name: x.name, size: x.size, mimeType: x.contentType }));
  }
  const isHtml = m.body?.contentType === "html";
  let html = isHtml ? m.body?.content ?? null : null;
  // Inline images (signature logos, pasted pictures): Outlook lists them as
  // attachments even when hasAttachments is false, so check the HTML instead.
  const cids = cidsIn(html);
  if (html && cids.size) html = await withOutlookInlineImages(token, enc, html, cids).catch(() => html);
  return {
    ...toSummary(m),
    to: (m.toRecipients ?? []).map(fmt).join(", "),
    cc: (m.ccRecipients ?? []).map(fmt).join(", "),
    html,
    text: isHtml ? null : m.body?.content ?? null,
    attachments,
    webLink: m.webLink ?? null,
  };
}

type GraphFolder = { id: string; displayName: string; parentFolderId?: string; unreadItemCount?: number; totalItemCount?: number; childFolderCount?: number };
const FOLDER_SELECT = "id,displayName,parentFolderId,unreadItemCount,totalItemCount,childFolderCount";
const WELL_KNOWN: [string, FolderKind][] = [
  ["inbox", "inbox"],
  ["drafts", "drafts"],
  ["sentitems", "sent"],
  ["deleteditems", "trash"],
  ["junkemail", "junk"],
  ["archive", "archive"],
];

// Outlook allows 4 requests at once per mailbox; stay under it.
const OUTLOOK_PARALLEL = 3;

// Top-level mail folders plus one level of subfolders (e.g. folders inside Inbox).
export async function listOutlookFolders(token: string): Promise<MailFolder[]> {
  const top = await graph<{ value: GraphFolder[] }>(token, `/me/mailFolders?$top=100&$select=${FOLDER_SELECT}`);
  const known = await mapLimit(WELL_KNOWN, OUTLOOK_PARALLEL, ([name, kind]) =>
    graph<GraphFolder>(token, `/me/mailFolders/${name}?$select=id`)
      .then((f) => [f.id, kind] as const)
      .catch(() => null)
  );
  const kindById = new Map(known.filter((k): k is readonly [string, FolderKind] => !!k));
  const parents = top.value.filter((f) => (f.childFolderCount ?? 0) > 0).slice(0, 25);
  const children = (
    await mapLimit(parents, OUTLOOK_PARALLEL, (p) =>
      graph<{ value: GraphFolder[] }>(token, `/me/mailFolders/${encodeURIComponent(p.id)}/childFolders?$top=100&$select=${FOLDER_SELECT}`)
        .then((r) => r.value.map((c) => ({ ...c, parentFolderId: p.id })))
        .catch(() => [] as GraphFolder[])
    )
  ).flat();
  const topIds = new Set(top.value.map((f) => f.id));
  return [...top.value, ...children].map((f) => ({
    id: f.id,
    name: f.displayName,
    kind: kindById.get(f.id) ?? "custom",
    parentId: f.parentFolderId && topIds.has(f.parentFolderId) && !top.value.some((t) => t.id === f.id) ? f.parentFolderId : null,
    unread: f.unreadItemCount ?? 0,
    total: f.totalItemCount ?? null,
  }));
}

// Message ids in an Outlook conversation.
export async function listOutlookThreadIds(token: string, conversationId: string): Promise<string[]> {
  if (!/^[A-Za-z0-9_=+/-]+$/.test(conversationId)) return [];
  const filter = encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`);
  const d = await graph<{ value: { id: string }[] }>(token, `/me/messages?$filter=${filter}&$select=id&$top=50`);
  return d.value.map((m) => m.id);
}

// Every email in a conversation (all folders, Sent Items included), newest first.
export async function listOutlookConversation(token: string, conversationId: string): Promise<MailSummary[]> {
  if (!/^[A-Za-z0-9_=+/-]+$/.test(conversationId)) return [];
  const filter = encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`);
  const d = await graph<{ value: GraphMsg[] }>(token, `/me/messages?$filter=${filter}&$select=${SELECT}&$top=100`);
  return d.value.map(toSummary).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Read / unread in Outlook (needs Mail.ReadWrite).
export async function setOutlookRead(token: string, id: string, read: boolean): Promise<void> {
  if (!/^[A-Za-z0-9_=+/-]+$/.test(id)) throw new MailError("provider_error", "Invalid message id.");
  const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ isRead: read }),
  });
  if (!res.ok) throw new MailError("provider_error", `Outlook didn't update read / unread (${res.status}).`);
}

// One attachment's bytes, by its position in the message's attachment list
// (the same order the message view shows them in).
export async function getOutlookAttachment(token: string, id: string, index: number) {
  if (!/^[A-Za-z0-9_=+/-]+$/.test(id)) throw new MailError("provider_error", "Invalid message id.");
  const enc = encodeURIComponent(id);
  const a = await graph<{ value: { id: string; name: string; size: number; contentType: string; isInline?: boolean; "@odata.type"?: string }[] }>(
    token,
    `/me/messages/${enc}/attachments?$select=id,name,size,contentType,isInline`
  );
  const att = a.value.filter((x) => !x.isInline)[index];
  if (!att) throw new MailError("provider_error", "That attachment wasn't found.");
  if (att["@odata.type"] && !/fileAttachment/i.test(att["@odata.type"])) {
    throw new MailError("provider_error", "This attachment is a linked item, not a file.");
  }
  const res = await fetchWithRetry(`${GRAPH}/me/messages/${enc}/attachments/${encodeURIComponent(att.id)}/$value`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new MailError("provider_error", "Outlook didn't send the attachment. Please try again.");
  return { name: att.name, mimeType: att.contentType || "application/octet-stream", bytes: new Uint8Array(await res.arrayBuffer()) };
}
