import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { sendFromMailbox, parseAddresses, SendError } from "@/lib/mail/sendMail";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";
import { signatureForSending } from "@/lib/mail/signature";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { provider?, to, cc?, subject, body, forwardMessageId?, replyMessageId?, signature? } → sent from the
// signed-in person's own Outlook / Gmail. A person always clicks Send for this.
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { provider?: string; to?: string; cc?: string; subject?: string; body?: string; forwardMessageId?: string; replyMessageId?: string; signature?: boolean };
    const to = parseAddresses(b.to);
    if (!to.length) throw new SendError("Add at least one recipient.");
    const cc = b.cc ? parseAddresses(b.cc) : [];
    const subject = String(b.subject ?? "").trim().slice(0, 300);
    if (!subject) throw new SendError("Add a subject.");
    const text = String(b.body ?? "").slice(0, 100_000);
    const forwardId = typeof b.forwardMessageId === "string" && b.forwardMessageId.length < 500 ? b.forwardMessageId : null;
    const replyId = typeof b.replyMessageId === "string" && b.replyMessageId.length < 500 ? b.replyMessageId : null;
    // The signature always comes from the person's saved settings, never from the page.
    const signature = b.signature === true ? await signatureForSending(user.id) : null;
    const r = await sendFromMailbox(orgId, user.id, { to, cc, subject, text, ...(signature ? { signature } : {}), ...(replyId ? { reply: { messageId: replyId } } : forwardId ? { forward: { messageId: forwardId } } : {}) }, { prefer: parseProvider(b.provider ?? null), kind: replyId ? "reply_by_user" : forwardId ? "forward_by_user" : "sent_by_user" });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof SendError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return mailErrorResponse("POST /api/mail/send", e);
  }
}
