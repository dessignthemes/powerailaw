import "server-only";
import { MailError } from "@/lib/mail/tokens";
import type { MailMessage, MailPage, MailSummary } from "@/lib/mail/types";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Header = { name: string; value: string };
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
};
type GmailMsg = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) throw new MailError("reconnect", "Your Gmail connection has expired. Reconnect to keep reading mail.");
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
    if (/insufficient|PERMISSION_DENIED|forbidden/i.test(String(reason) + JSON.stringify(body))) {
      throw new MailError(
        "missing_scope",
        "Gmail access wasn't granted. Reconnect and keep the Gmail box ticked on Google's consent screen."
      );
    }
  }
  if (!res.ok) {
    console.error("Gmail API error", res.status, await res.text().catch(() => ""));
    throw new MailError("provider_error", "Gmail didn't respond as expected. Please try again.");
  }
  return res.json() as Promise<T>;
}

function header(p: Part | undefined, name: string) {
  return p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// "Jane Doe <jane@x.com>" → { name: "Jane Doe", email: "jane@x.com" }
export function parseAddress(v: string) {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim() };
  return { name: v.trim(), email: v.trim() };
}

function decodeB64Url(data: string) {
  const bin = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return bin.toString("utf8");
}

function hasAttachment(p: Part | undefined): boolean {
  if (!p) return false;
  if (p.filename && p.body?.attachmentId) return true;
  return (p.parts ?? []).some(hasAttachment);
}

function toSummary(m: GmailMsg): MailSummary {
  const from = parseAddress(header(m.payload, "From"));
  const dateHeader = header(m.payload, "Date");
  const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(dateHeader);
  return {
    id: m.id,
    threadId: m.threadId,
    from: from.name,
    fromEmail: from.email,
    subject: header(m.payload, "Subject") || "(no subject)",
    snippet: decodeEntities(m.snippet ?? ""),
    date: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    unread: (m.labelIds ?? []).includes("UNREAD"),
    hasAttachments: hasAttachment(m.payload),
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function listGmail(token: string, opts: { q?: string; pageToken?: string }): Promise<MailPage> {
  const params = new URLSearchParams({ maxResults: "25" });
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  else params.set("labelIds", "INBOX");
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const list = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `/messages?${params}`);
  const ids = (list.messages ?? []).map((m) => m.id);

  const meta = new URLSearchParams({ format: "metadata" });
  ["From", "Subject", "Date"].forEach((h) => meta.append("metadataHeaders", h));
  const msgs = await Promise.all(ids.map((id) => gmail<GmailMsg>(token, `/messages/${id}?${meta}`)));

  return { messages: msgs.map(toSummary), nextPageToken: list.nextPageToken ?? null };
}

export async function getGmail(token: string, id: string, accountEmail: string | null): Promise<MailMessage> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new MailError("provider_error", "Invalid message id.");
  const m = await gmail<GmailMsg>(token, `/messages/${id}?format=full`);

  let html: string | null = null;
  let text: string | null = null;
  const attachments: MailMessage["attachments"] = [];
  const walk = (p: Part | undefined) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      attachments.push({ name: p.filename, size: p.body.size ?? 0, mimeType: p.mimeType ?? "" });
    } else if (p.body?.data) {
      if (p.mimeType === "text/html" && html === null) html = decodeB64Url(p.body.data);
      else if (p.mimeType === "text/plain" && text === null) text = decodeB64Url(p.body.data);
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(m.payload);

  const authuser = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "";
  return {
    ...toSummary(m),
    to: header(m.payload, "To"),
    cc: header(m.payload, "Cc"),
    html,
    text,
    attachments,
    webLink: `https://mail.google.com/mail/u/0/${authuser}#all/${m.threadId}`,
  };
}
