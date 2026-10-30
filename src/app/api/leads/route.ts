import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/data/org";
import { createLead, intakeLink, listLeads, leadFail } from "@/lib/data/leads";
import { getSignature, signatureForSending } from "@/lib/mail/signature";
import { sendFromMailbox, SendError } from "@/lib/mail/sendMail";

export const dynamic = "force-dynamic";

// GET → { leads, link } (the firm's intake form address)
export async function GET() {
  try {
    const orgId = await getCurrentOrgId();
    const [leads, link] = await Promise.all([listLeads(orgId), intakeLink(orgId)]);
    return NextResponse.json({ leads, link });
  } catch (e) {
    return leadFail("GET /api/leads", e);
  }
}

// POST { action: "invite", firstName, lastName, email, send?, message? } → a personal link (emailed when send)
//      { action: "add", form } → a lead entered by hand (e.g. from a phone call)
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "add") {
      const { lead } = await createLead(orgId, user.id, b, false);
      return NextResponse.json({ lead }, { status: 201 });
    }
    if (b.action !== "invite") return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
    const { lead, url } = await createLead(orgId, user.id, b, true);
    let sent = false;
    let sendError: string | null = null;
    if (b.send === true && url) {
      const first = String(b.firstName ?? "").trim();
      const note = String(b.message ?? "").trim().slice(0, 2000);
      const text = [
        first ? `Dear ${first},` : "Hello,",
        "",
        note || "Thank you for contacting our office. To help us prepare for your consultation, please fill in our short intake form:",
        "",
        url,
        "",
        "It takes about five minutes. Your answers come straight to our office and are kept confidential.",
      ].join("\n");
      try {
        const sig = (await getSignature(user.id)).on ? await signatureForSending(user.id) : null;
        await sendFromMailbox(orgId, user.id, { to: [lead.email], subject: "Your intake form", text, ...(sig ? { signature: sig } : {}) }, { kind: "lead_invite" });
        sent = true;
      } catch (e) {
        sendError = e instanceof SendError ? e.message : "The email couldn't be sent. Copy the link and send it yourself.";
      }
    }
    return NextResponse.json({ lead, url, sent, sendError }, { status: 201 });
  } catch (e) {
    return leadFail("POST /api/leads", e);
  }
}
