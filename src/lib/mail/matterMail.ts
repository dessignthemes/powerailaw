import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, MailError } from "@/lib/mail/tokens";
import { getUserConnections } from "@/lib/data/oauth";
import { listGmail, getGmail, listGmailThreadIds, getGmailAttachment } from "@/lib/mail/google";
import { listOutlook, getOutlook, listOutlookThreadIds, getOutlookAttachment } from "@/lib/mail/microsoft";
import { createDocumentFromUpload, newStoragePath, DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { fileTypeFromName, FILE_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/documents/fileTypes";
import { matterTag } from "@/lib/mail/matterTag";
import { matterNumberOf } from "@/lib/ai/keyDates";
import type { MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";

// Emails and text messages logged on a matter (see 0027_matter_messages.sql).
// An email lands on a matter when it's tagged from the Inbox, when its subject
// carries the matter number ("[REP-2026-0001]"; emails written from the matter
// always do, so replies keep it), or when it's in a thread already on the matter.

const db = () => createAdminClient();

export class MatterMailError extends Error {
  constructor(public status: 400 | 403 | 404 | 503, message: string) {
    super(message);
  }
}

export type MatterMessage = {
  id: string;
  channel: "email" | "sms";
  direction: "in" | "out";
  source: "tagged" | "number" | "thread" | "logged";
  provider: MailProvider | null;
  mailboxEmail: string | null;
  mine: boolean; // in the signed-in person's own mailbox (so it can be opened in full)
  messageId: string | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  cc: string;
  phone: string | null;
  sentAt: string;
  snippet: string;
  bodyText: string | null;
  webLink: string | null;
  hasAttachments: boolean;
  createdAt: string;
};

type Row = {
  id: string;
  channel: MatterMessage["channel"];
  direction: MatterMessage["direction"];
  source: MatterMessage["source"];
  provider: MailProvider | null;
  mailbox_user_id: string | null;
  mailbox_email: string | null;
  message_id: string | null;
  thread_id: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  to_text: string;
  cc_text: string;
  phone: string | null;
  sent_at: string;
  snippet: string;
  body_text: string | null;
  web_link: string | null;
  has_attachments: boolean;
  created_at: string;
};

const toMessage = (r: Row, userId: string): MatterMessage => ({
  id: r.id,
  channel: r.channel,
  direction: r.direction,
  source: r.source,
  provider: r.provider,
  mailboxEmail: r.mailbox_email,
  mine: r.mailbox_user_id === userId,
  messageId: r.message_id,
  subject: r.subject,
  fromName: r.from_name,
  fromEmail: r.from_email,
  to: r.to_text,
  cc: r.cc_text,
  phone: r.phone,
  sentAt: r.sent_at,
  snippet: r.snippet,
  bodyText: r.body_text,
  webLink: r.web_link,
  hasAttachments: r.has_attachments,
  createdAt: r.created_at,
});

function missingTable(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "PGRST205" || e.code === "42P01" || /matter_messages/.test(e.message ?? ""));
}
const setup = () => new MatterMailError(503, "Matter emails aren't set up yet. Run supabase/migrations/0027_matter_messages.sql in the Supabase SQL editor.");

// Plain text of an email, for the matter's record.
function bodyOf(m: MailMessage): string {
  if (m.text?.trim()) return m.text.slice(0, 60_000);
  if (!m.html) return "";
  return m.html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60_000);
}

const direction = (fromEmail: string, mailbox: string | null) =>
  mailbox && fromEmail.trim().toLowerCase() === mailbox.trim().toLowerCase() ? "out" : "in";

async function fetchFull(provider: MailProvider, token: string, id: string, mailbox: string | null) {
  return provider === "google" ? getGmail(token, id, mailbox) : getOutlook(token, id);
}

async function orgMatters(orgId: string) {
  const { data } = await db().from("matters").select("*").eq("org_id", orgId).limit(5000);
  return ((data ?? []) as { id: string; title: string; matter_number?: string | null }[]).map((m) => ({
    id: m.id,
    title: m.title,
    number: matterNumberOf(m),
  }));
}

async function matterOf(orgId: string, matterId: string) {
  const { data } = await db().from("matters").select("*").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  if (!data) throw new MatterMailError(404, "Matter not found.");
  const m = data as { id: string; title: string; matter_number?: string | null };
  return { id: m.id, title: m.title, number: matterNumberOf(m) };
}

async function findRow(orgId: string, provider: MailProvider, messageId: string) {
  const { data, error } = await db().from("matter_messages").select("id, matter_id, body_text").eq("org_id", orgId).eq("provider", provider).eq("message_id", messageId).maybeSingle();
  if (error) {
    if (missingTable(error)) throw setup();
    throw error;
  }
  return data as { id: string; matter_id: string; body_text: string | null } | null;
}

// Saves (or moves) one email onto a matter, with its full text.
async function saveEmail(opts: {
  orgId: string;
  userId: string;
  matterId: string;
  provider: MailProvider;
  mailbox: string | null;
  msg: MailMessage | MailSummary;
  source: MatterMessage["source"];
  move?: boolean;
}) {
  const { msg } = opts;
  const full = "to" in msg ? (msg as MailMessage) : null;
  const fields = {
    org_id: opts.orgId,
    matter_id: opts.matterId,
    channel: "email",
    direction: direction(msg.fromEmail, opts.mailbox),
    source: opts.source,
    provider: opts.provider,
    mailbox_user_id: opts.userId,
    mailbox_email: opts.mailbox,
    message_id: msg.id,
    thread_id: msg.threadId,
    subject: msg.subject.slice(0, 500),
    from_name: msg.from.slice(0, 300),
    from_email: msg.fromEmail.slice(0, 320),
    sent_at: msg.date,
    snippet: msg.snippet.slice(0, 500),
    has_attachments: msg.hasAttachments,
    ...(full ? { to_text: full.to.slice(0, 2000), cc_text: full.cc.slice(0, 2000), body_text: bodyOf(full), web_link: full.webLink } : {}),
    created_by: opts.userId,
  };
  const existing = await findRow(opts.orgId, opts.provider, msg.id);
  if (existing) {
    if (existing.matter_id !== opts.matterId && !opts.move) return existing.id; // already on another matter
    const { error } = await db().from("matter_messages").update(fields).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await db().from("matter_messages").insert(fields).select("id").single();
  if (error) {
    if (missingTable(error)) throw setup();
    if (error.code === "23505") return null; // saved at the same moment by another request
    throw error;
  }
  return (data as { id: string }).id;
}

// ── Inbox ─────────────────────────────────────────────────────────────────

// The matter each listed email is on. Emails carrying a matter number, or in a
// thread already on a matter, are saved to that matter here (summary only;
// the full text is added when the matter's Emails tab is opened).
export async function matchInbox(orgId: string, userId: string, provider: MailProvider, mailbox: string | null, messages: MailSummary[]) {
  if (!messages.length) return messages;
  const s = db();
  const ids = messages.map((m) => m.id);
  const threads = [...new Set(messages.map((m) => m.threadId).filter((x): x is string => !!x))];
  const [{ data: byId, error }, { data: byThread }, matters] = await Promise.all([
    s.from("matter_messages").select("message_id, matter_id").eq("org_id", orgId).eq("provider", provider).in("message_id", ids),
    threads.length
      ? s.from("matter_messages").select("thread_id, matter_id").eq("org_id", orgId).eq("provider", provider).in("thread_id", threads)
      : Promise.resolve({ data: [] as { thread_id: string; matter_id: string }[] }),
    orgMatters(orgId),
  ]);
  if (error) {
    if (missingTable(error)) return messages; // not set up yet: the Inbox works as before
    throw error;
  }
  const matterById = new Map(matters.map((m) => [m.id, m]));
  const byNumber = new Map(matters.filter((m) => m.number).map((m) => [m.number!, m]));
  const tagged = new Map((byId ?? []).map((r) => [r.message_id as string, r.matter_id as string]));
  const threadMatter = new Map((byThread ?? []).map((r) => [r.thread_id as string, r.matter_id as string]));

  const out: MailSummary[] = [];
  for (const m of messages) {
    let matterId = tagged.get(m.id) ?? null;
    if (!matterId) {
      const num = matterTag(m.subject, byNumber);
      const viaThread = m.threadId ? threadMatter.get(m.threadId) : undefined;
      const target = num ? num.id : viaThread;
      if (target) {
        await saveEmail({ orgId, userId, matterId: target, provider, mailbox, msg: m, source: num ? "number" : "thread" }).catch(() => null);
        matterId = target;
      }
    }
    const mt = matterId ? matterById.get(matterId) : null;
    out.push(mt ? { ...m, matter: { id: mt.id, number: mt.number, title: mt.title } } : m);
  }
  return out;
}

// Tag an email in the Inbox to a matter (matterId null takes it off).
export async function tagEmail(orgId: string, userId: string, provider: MailProvider, messageId: string, matterId: string | null) {
  if (!matterId) {
    const row = await findRow(orgId, provider, messageId);
    if (row) await db().from("matter_messages").delete().eq("id", row.id);
    return null;
  }
  const matter = await matterOf(orgId, matterId);
  const { token, email } = await getAccessToken(userId, provider);
  const msg = await fetchFull(provider, token, messageId, email);
  await saveEmail({ orgId, userId, matterId, provider, mailbox: email, msg, source: "tagged", move: true });
  const attachments = await copyAttachments({ orgId, userId, userEmail: email, matterId, provider, token, messageId, msg });
  return { ...matter, attachments };
}

// Filing an email on a matter also puts its attachments in the matter's
// Documents (once: filing the same email again doesn't add copies).
async function copyAttachments(o: {
  orgId: string;
  userId: string;
  userEmail: string | null;
  matterId: string;
  provider: MailProvider;
  token: string;
  messageId: string;
  msg: MailMessage;
  // Only these attachments (by position), each saved under the given name.
  // Without it: every attachment, under its own name.
  picks?: { index: number; name: string }[];
}) {
  const added: string[] = [];
  const skipped: { name: string; why: string }[] = [];
  if (!o.msg.attachments.length) return { added, skipped };
  const chosen = (o.picks ?? o.msg.attachments.map((a, index) => ({ index, name: a.name })))
    .filter((p) => p.index >= 0 && p.index < o.msg.attachments.length)
    .map((p) => ({ index: p.index, name: keepExtension(p.name, o.msg.attachments[p.index].name) }));
  const note = `Attachment from email: ${o.msg.subject || "(no subject)"} (${o.msg.from || "unknown sender"})`.slice(0, 300);

  // Already on this matter from this email?
  const { data: existing } = await db()
    .from("documents")
    .select("title, document_versions(note)")
    .eq("org_id", o.orgId)
    .eq("matter_id", o.matterId)
    .in("title", chosen.map((c) => c.name));
  const already = new Set(
    ((existing ?? []) as { title: string; document_versions?: { note: string | null }[] }[])
      .filter((d) => (d.document_versions ?? []).some((v) => v.note === note))
      .map((d) => d.title)
  );

  for (const c of chosen) {
    const i = c.index;
    const a = o.msg.attachments[i];
    const name = c.name;
    if (already.has(name)) continue;
    const type = fileTypeFromName(name);
    if (!type) {
      skipped.push({ name, why: "this kind of file can't be stored in Documents" });
      continue;
    }
    if (a.size > MAX_DOCUMENT_BYTES) {
      skipped.push({ name, why: "it's over 25 MB" });
      continue;
    }
    try {
      const file = o.provider === "google" ? await getGmailAttachment(o.token, o.messageId, i) : await getOutlookAttachment(o.token, o.messageId, i);
      if (file.bytes.length > MAX_DOCUMENT_BYTES) throw new Error("too big");
      const path = newStoragePath(o.orgId, o.matterId, type);
      const up = await db().storage.from(DOCUMENTS_BUCKET).upload(path, file.bytes, { contentType: FILE_TYPES[type].mime, upsert: false });
      if (up.error) throw up.error;
      await createDocumentFromUpload({ orgId: o.orgId, matterId: o.matterId, userId: o.userId, userEmail: o.userEmail, title: name, path, note });
      added.push(name);
    } catch (e) {
      console.error("Copying an email attachment to Documents failed:", e);
      skipped.push({ name, why: "the file couldn't be read (it may be damaged or password-protected)" });
    }
  }
  return { added, skipped };
}

// A new name keeps the file's own extension ("Loan approval" → "Loan approval.pdf"),
// so the file still opens as the right kind of document.
function keepExtension(name: string, original: string) {
  const ext = original.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
  let n = String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) n = original;
  if (ext && !n.toLowerCase().endsWith(ext.toLowerCase())) n = `${n}${ext}`;
  return n.slice(0, 200);
}

// Saves some or all of an email's attachments to a matter's Documents (the email
// itself isn't filed). Each can get a new name first.
export async function saveAttachmentsToMatter(
  orgId: string,
  userId: string,
  provider: MailProvider,
  messageId: string,
  matterId: string,
  picks: { index: number; name: string }[]
) {
  await matterOf(orgId, matterId);
  if (!picks.length) throw new MatterMailError(400, "Pick at least one attachment.");
  const { token, email } = await getAccessToken(userId, provider);
  const msg = await fetchFull(provider, token, messageId, email);
  return copyAttachments({ orgId, userId, userEmail: email, matterId, provider, token, messageId, msg, picks });
}

// ── Matter ────────────────────────────────────────────────────────────────

export async function listMatterMessages(orgId: string, userId: string, matterId: string): Promise<MatterMessage[]> {
  await matterOf(orgId, matterId);
  const { data, error } = await db().from("matter_messages").select("*").eq("org_id", orgId).eq("matter_id", matterId).order("sent_at", { ascending: false }).limit(500);
  if (error) {
    if (missingTable(error)) throw setup();
    throw error;
  }
  return ((data ?? []) as Row[]).map((r) => toMessage(r, userId));
}

// Looks in the signed-in person's mailbox(es) for emails carrying the matter
// number and for new emails in threads already on the matter.
export async function syncMatterEmails(orgId: string, userId: string, matterId: string): Promise<{ added: number; checked: string[] }> {
  const matter = await matterOf(orgId, matterId);
  const conns = await getUserConnections(userId);
  let added = 0;
  const checked: string[] = [];
  for (const c of conns) {
    const provider = c.provider as MailProvider;
    let token: string;
    let mailbox: string | null;
    try {
      ({ token, email: mailbox } = await getAccessToken(userId, provider));
    } catch (e) {
      if (e instanceof MailError) continue; // not connected / needs reconnecting
      throw e;
    }
    checked.push(mailbox ?? provider);
    const found = new Map<string, "number" | "thread">();
    if (matter.number) {
      const q = provider === "google" ? `"${matter.number}"` : matter.number;
      const page = provider === "google" ? await listGmail(token, { q }) : await listOutlook(token, { q });
      for (const m of page.messages) if (m.subject.toUpperCase().includes(matter.number)) found.set(m.id, "number");
    }
    const { data: threads } = await db()
      .from("matter_messages")
      .select("thread_id")
      .eq("org_id", orgId)
      .eq("matter_id", matterId)
      .eq("provider", provider)
      .eq("mailbox_user_id", userId)
      .not("thread_id", "is", null)
      .limit(20);
    for (const t of [...new Set((threads ?? []).map((r) => r.thread_id as string))].slice(0, 10)) {
      const ids = provider === "google" ? await listGmailThreadIds(token, t).catch(() => []) : await listOutlookThreadIds(token, t).catch(() => []);
      for (const id of ids) if (!found.has(id)) found.set(id, "thread");
    }
    // Save new ones, and fill in the full text of ones saved from the Inbox list.
    let fetched = 0;
    for (const [id, source] of found) {
      const row = await findRow(orgId, provider, id);
      if (row && (row.matter_id !== matterId || row.body_text !== null)) continue;
      if (fetched >= 20) break;
      fetched++;
      const msg = await fetchFull(provider, token, id, mailbox).catch(() => null);
      if (!msg) continue;
      await saveEmail({ orgId, userId, matterId, provider, mailbox, msg, source: row ? "number" : source });
      if (!row) added++;
    }
  }
  return { added, checked };
}

// Full text of a saved email (fetched from the person's own mailbox if needed).
export async function messageBody(orgId: string, userId: string, matterId: string, id: string): Promise<MatterMessage> {
  const { data } = await db().from("matter_messages").select("*").eq("id", id).eq("org_id", orgId).eq("matter_id", matterId).maybeSingle();
  if (!data) throw new MatterMailError(404, "Message not found.");
  const row = data as Row;
  if (row.body_text === null && row.channel === "email" && row.provider && row.message_id && row.mailbox_user_id === userId) {
    const { token, email } = await getAccessToken(userId, row.provider);
    const msg = await fetchFull(row.provider, token, row.message_id, email);
    await saveEmail({ orgId, userId, matterId, provider: row.provider, mailbox: email, msg, source: row.source });
    const { data: again } = await db().from("matter_messages").select("*").eq("id", id).maybeSingle();
    return toMessage(again as Row, userId);
  }
  return toMessage(row, userId);
}

// A text message (or an email sent elsewhere) logged by hand.
export async function logMessage(
  orgId: string,
  userId: string,
  matterId: string,
  input: { channel?: unknown; direction?: unknown; phone?: unknown; body?: unknown; sentAt?: unknown; subject?: unknown }
) {
  await matterOf(orgId, matterId);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const body = str(input.body, 5000);
  if (!body) throw new MatterMailError(400, "Type the message first.");
  const sentAt = typeof input.sentAt === "string" && !isNaN(Date.parse(input.sentAt)) ? new Date(input.sentAt).toISOString() : new Date().toISOString();
  const { error } = await db()
    .from("matter_messages")
    .insert({
      org_id: orgId,
      matter_id: matterId,
      channel: input.channel === "email" ? "email" : "sms",
      direction: input.direction === "in" ? "in" : "out",
      source: "logged",
      phone: str(input.phone, 40) || null,
      subject: str(input.subject, 300),
      snippet: body.slice(0, 500),
      body_text: body,
      sent_at: sentAt,
      created_by: userId,
    });
  if (error) {
    if (missingTable(error)) throw setup();
    throw error;
  }
}

export async function removeMessage(orgId: string, matterId: string, id: string) {
  const { error } = await db().from("matter_messages").delete().eq("id", id).eq("org_id", orgId).eq("matter_id", matterId);
  if (error) throw error;
}
