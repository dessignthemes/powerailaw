import "server-only";
import { MailError } from "@/lib/mail/tokens";
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
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
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

export async function listOutlook(token: string, opts: { q?: string; pageToken?: string; folder?: string }): Promise<MailPage> {
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
    url = `/me/mailFolders/${folder ?? "inbox"}/messages?$top=25&$select=${SELECT}&$orderby=receivedDateTime desc`;
  }
  const data = await graph<{ value: GraphMsg[]; "@odata.nextLink"?: string }>(token, url);
  return { messages: data.value.map(toSummary), nextPageToken: data["@odata.nextLink"] ?? null };
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
  return {
    ...toSummary(m),
    to: (m.toRecipients ?? []).map(fmt).join(", "),
    cc: (m.ccRecipients ?? []).map(fmt).join(", "),
    html: isHtml ? m.body?.content ?? null : null,
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

// Top-level mail folders plus one level of subfolders (e.g. folders inside Inbox).
export async function listOutlookFolders(token: string): Promise<MailFolder[]> {
  const [top, known] = await Promise.all([
    graph<{ value: GraphFolder[] }>(token, `/me/mailFolders?$top=100&$select=${FOLDER_SELECT}`),
    Promise.all(
      WELL_KNOWN.map(([name, kind]) =>
        graph<GraphFolder>(token, `/me/mailFolders/${name}?$select=id`)
          .then((f) => [f.id, kind] as const)
          .catch(() => null)
      )
    ),
  ]);
  const kindById = new Map(known.filter((k): k is readonly [string, FolderKind] => !!k));
  const parents = top.value.filter((f) => (f.childFolderCount ?? 0) > 0).slice(0, 25);
  const children = (
    await Promise.all(
      parents.map((p) =>
        graph<{ value: GraphFolder[] }>(token, `/me/mailFolders/${encodeURIComponent(p.id)}/childFolders?$top=100&$select=${FOLDER_SELECT}`)
          .then((r) => r.value.map((c) => ({ ...c, parentFolderId: p.id })))
          .catch(() => [] as GraphFolder[])
      )
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
