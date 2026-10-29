import "server-only";
import { getUserConnections } from "@/lib/data/oauth";
import { getAccessToken, canSend } from "@/lib/mail/tokens";
import { getGmailAttachment } from "@/lib/mail/google";
import type { MailProvider } from "@/lib/mail/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends email through the person's own connected mailbox (Microsoft 365 /
// Outlook via Graph, or Gmail): free, from their own address, saved in their
// Sent folder. A person always chooses to send; nothing here sends on its own
// except the firm's notifications (task assignments, morning check-in).

export class SendError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

export type OutgoingMessage = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string; // plain text (always)
  html?: string; // optional rich version
  attachments?: { name: string; mime: string; bytes: Uint8Array }[];
  forward?: { messageId: string }; // forward this email (its attachments go along)
  reply?: { messageId: string }; // reply in the same conversation (the original is quoted by the mailbox)
  signature?: { html: string; text: string }; // the sender's signature, added under their message
  forwardComment?: string; // (set here) Outlook forward: the note above the original, as HTML
};

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export function parseAddresses(raw: string | string[] | undefined): string[] {
  const list = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .map((s) => s.match(/<([^>]+)>/)?.[1] ?? s)
    .filter(Boolean);
  const bad = list.filter((s) => !EMAIL.test(s));
  if (bad.length) throw new SendError(`Check the email address${bad.length > 1 ? "es" : ""}: ${bad.join(", ")}`);
  return [...new Set(list.map((s) => s.toLowerCase()))].slice(0, 50);
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
export const textToHtml = (t: string) => `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(t).replace(/\n/g, "<br>")}</div>`;

// Puts the signature under the person's own message, above any copied
// "Forwarded message" block.
const FORWARD_MARK = /\n*-{6,} Forwarded message -{6,}/;
export function withSignature(m: OutgoingMessage): OutgoingMessage {
  if (!m.signature) return m;
  const i = m.text.search(FORWARD_MARK);
  const note = (i < 0 ? m.text : m.text.slice(0, i)).trimEnd();
  const rest = i < 0 ? "" : m.text.slice(i);
  const noteHtml = `${m.html ?? textToHtml(note)}${m.signature.html}`;
  return {
    ...m,
    text: `${note}\n\n${m.signature.text}${rest}`,
    html: `${noteHtml}${rest ? textToHtml(rest.replace(/^\n+/, "\n")) : ""}`,
    forwardComment: noteHtml,
    signature: undefined,
  };
}

// Which of the person's mailboxes can send (prefer the one asked for).
export async function sendingMailbox(userId: string, prefer?: MailProvider | null) {
  const conns = (await getUserConnections(userId).catch(() => [])).filter((c) => canSend(c));
  return (prefer ? conns.find((c) => c.provider === prefer) : null) ?? conns.find((c) => c.provider === "microsoft") ?? conns[0] ?? null;
}

async function graph(token: string, path: string, body: unknown) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (res.status === 401 || res.status === 403) throw new SendError("Outlook didn't allow sending. Reconnect Outlook once and allow “Send email”.", 403, "needs_permission");
    throw new SendError(`Outlook couldn't send the email${d.error?.message ? `: ${d.error.message}` : "."}`, 502);
  }
}

async function sendOutlook(token: string, m: OutgoingMessage) {
  const rcpt = (list: string[] = []) => list.map((address) => ({ emailAddress: { address } }));
  if (m.reply) {
    // Outlook's own reply: same conversation, original quoted underneath.
    const id = encodeURIComponent(m.reply.messageId);
    await graph(token, `/me/messages/${id}/reply`, { comment: m.html ?? textToHtml(m.text), message: { toRecipients: rcpt(m.to), ...(m.cc?.length ? { ccRecipients: rcpt(m.cc) } : {}) } });
    return;
  }
  if (m.forward) {
    // Outlook forwards with the original's text and attachments; only the note
    // written above the copied "Forwarded message" block goes with it.
    const id = encodeURIComponent(m.forward.messageId);
    const note = m.text.split(/-{6,} Forwarded message -{6,}/)[0].trim();
    await graph(token, `/me/messages/${id}/forward`, { comment: m.forwardComment ?? textToHtml(note), toRecipients: rcpt(m.to), ...(m.cc?.length ? { message: { ccRecipients: rcpt(m.cc) } } : {}) });
    return;
  }
  const attachments = (m.attachments ?? []).map((a) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.mime, contentBytes: Buffer.from(a.bytes).toString("base64") }));
  await graph(token, "/me/sendMail", {
    message: { subject: m.subject, body: { contentType: "HTML", content: m.html ?? textToHtml(m.text) }, toRecipients: rcpt(m.to), ccRecipients: rcpt(m.cc), ...(attachments.length ? { attachments } : {}) },
    saveToSentItems: true,
  });
}

// RFC 2822 message for Gmail, with attachments.
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64").replace(/.{76}/g, "$&\r\n");
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
function mime(m: OutgoingMessage & { from?: string; inReplyTo?: string; references?: string }) {
  const mixed = `mixed_${crypto.randomUUID()}`;
  const alt = `alt_${crypto.randomUUID()}`;
  const head = [
    `To: ${m.to.join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    `Subject: ${encWord(m.subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${[m.references, m.inReplyTo].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
  ];
  const altPart = [`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(m.text), `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(m.html ?? textToHtml(m.text)), `--${alt}--`].join("\r\n");
  if (!m.attachments?.length) return [...head, altPart].join("\r\n");
  const parts = m.attachments.map((a) =>
    [`--${mixed}`, `Content-Type: ${a.mime}; name="${encWord(a.name)}"`, `Content-Disposition: attachment; filename="${encWord(a.name)}"`, "Content-Transfer-Encoding: base64", "", b64(a.bytes)].join("\r\n")
  );
  return [...head, `Content-Type: multipart/mixed; boundary="${mixed}"`, "", `--${mixed}`, altPart, ...parts, `--${mixed}--`].join("\r\n");
}

async function sendGmail(token: string, m: OutgoingMessage) {
  let msg: OutgoingMessage & { inReplyTo?: string; references?: string } = m;
  let threadId: string | undefined;
  if (m.reply) {
    // Same Gmail thread: threadId plus the original's Message-ID headers.
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.reply.messageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (r.ok) {
      const d = (await r.json()) as { threadId?: string; payload?: { headers?: { name: string; value: string }[] } };
      const h = (n: string) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value;
      threadId = d.threadId;
      msg = { ...m, inReplyTo: h("message-id"), references: h("references") };
    }
  }
  if (m.forward) {
    // Gmail has no "forward": attach the original's files ourselves.
    const files: { name: string; mime: string; bytes: Uint8Array }[] = [];
    for (let i = 0; i < 20; i++) {
      try {
        const a = await getGmailAttachment(token, m.forward.messageId, i);
        files.push({ name: a.name, mime: a.mimeType || "application/octet-stream", bytes: a.bytes });
      } catch {
        break;
      }
    }
    msg = { ...msg, attachments: [...(msg.attachments ?? []), ...files] };
  }
  const total = (msg.attachments ?? []).reduce((n, a) => n + a.bytes.length, 0);
  if (total > 24 * 1024 * 1024) throw new SendError("Gmail can't send attachments over 25 MB in one email. Share them through Secure Files instead.");
  const raw = Buffer.from(mime(msg)).toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new SendError("Gmail didn't allow sending. Reconnect Gmail once and allow “Send email”.", 403, "needs_permission");
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new SendError(`Gmail couldn't send the email${d.error?.message ? `: ${d.error.message}` : "."}`, 502);
  }
}

// Sends from the person's own mailbox and records it in the email log.
export async function sendFromMailbox(orgId: string | null, userId: string, message: OutgoingMessage, opts: { prefer?: MailProvider | null; kind?: string } = {}) {
  const m = withSignature(message);
  const box = await sendingMailbox(userId, opts.prefer);
  if (!box) throw new SendError("Reconnect Outlook (or Gmail) once and allow “Send email”, so LawPower can send from your mailbox.", 403, "needs_permission");
  if (!m.to.length) throw new SendError("Add at least one recipient.");
  const { token } = await getAccessToken(userId, box.provider);
  const log = (status: "sent" | "failed", error?: string) =>
    createAdminClient()
      .from("email_log")
      .insert({ org_id: orgId, to_email: m.to.join(", ").slice(0, 320), kind: opts.kind ?? "sent_by_user", subject: m.subject.slice(0, 300), status, provider_id: `${box.provider}:${box.account_email ?? ""}`.slice(0, 200), error: error?.slice(0, 500) ?? null })
      .then(() => undefined, () => undefined);
  try {
    if (box.provider === "microsoft") await sendOutlook(token, m);
    else await sendGmail(token, m);
    await log("sent");
    return { provider: box.provider, from: box.account_email };
  } catch (e) {
    await log("failed", (e as Error).message);
    throw e;
  }
}
