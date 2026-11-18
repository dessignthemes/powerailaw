import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { sendFromMailbox, parseAddresses, SendError } from "@/lib/mail/sendMail";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";
import { signatureForSending } from "@/lib/mail/signature";
import { maybeRemember } from "@/lib/data/mailFollowups";
import { attachmentsFor, portalLinkFor } from "@/lib/mail/matterAttachments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { provider?, to, cc?, bcc?, subject, body, forwardMessageId?, replyMessageId?, signature?, matterId?, documentIds?, asPortalLink? } → sent from the
// signed-in person's own Outlook / Gmail. A person always clicks Send for this.
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { provider?: string; to?: string; cc?: string; bcc?: string; subject?: string; body?: string; forwardMessageId?: string; replyMessageId?: string; signature?: boolean; matterId?: string; documentIds?: string[]; asPortalLink?: boolean };
    const to = parseAddresses(b.to);
    if (!to.length) throw new SendError("Add at least one recipient.");
    const cc = b.cc ? parseAddresses(b.cc) : [];
    const bcc = b.bcc ? parseAddresses(b.bcc) : [];
    const subject = String(b.subject ?? "").trim().slice(0, 300);
    if (!subject) throw new SendError("Add a subject.");
    let text = String(b.body ?? "").slice(0, 100_000);
    // Documents from the matter: attached, or (too big for email) on the client portal with a link.
    const docIds = Array.isArray(b.documentIds) ? b.documentIds.filter((x): x is string => typeof x === "string") : [];
    const matterId = typeof b.matterId === "string" && /^[0-9a-f-]{36}$/i.test(b.matterId) ? b.matterId : null;
    if (docIds.length && !matterId) throw new SendError("Documents can only be sent from a matter.");
    let attachments: { name: string; mime: string; bytes: Uint8Array }[] = [];
    if (docIds.length && matterId) {
      if (b.asPortalLink === true) {
        const note = await portalLinkFor(orgId, matterId, docIds, new URL(request.url).origin);
        const i = text.search(/\n*-{6,} Forwarded message -{6,}/);
        text = i < 0 ? `${text.trimEnd()}\n\n${note}` : `${text.slice(0, i).trimEnd()}\n\n${note}${text.slice(i)}`;
      } else attachments = await attachmentsFor(orgId, matterId, docIds);
    }
    const forwardId = typeof b.forwardMessageId === "string" && b.forwardMessageId.length < 500 ? b.forwardMessageId : null;
    const replyId = typeof b.replyMessageId === "string" && b.replyMessageId.length < 500 ? b.replyMessageId : null;
    // The signature always comes from the person's saved settings, never from the page.
    const signature = b.signature === true ? await signatureForSending(user.id) : null;
    const r = await sendFromMailbox(orgId, user.id, { to, cc, ...(bcc.length ? { bcc } : {}), subject, text, ...(attachments.length ? { attachments } : {}), ...(signature ? { signature } : {}), ...(replyId ? { reply: { messageId: replyId } } : forwardId ? { forward: { messageId: forwardId } } : {}) }, { prefer: parseProvider(b.provider ?? null), kind: replyId ? "reply_by_user" : forwardId ? "forward_by_user" : "sent_by_user" });
    // Asked the recipient for something ("Please get back to me…")? Remind me the next business day.
    const followUp = await maybeRemember({ orgId, userId: user.id, provider: r.provider, to, subject, text });
    return NextResponse.json({ ok: true, ...r, followUp });
  } catch (e) {
    if (e instanceof SendError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return mailErrorResponse("POST /api/mail/send", e);
  }
}
