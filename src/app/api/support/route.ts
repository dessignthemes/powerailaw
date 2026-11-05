import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/data/org";
import { SUPPORT_EMAIL } from "@/components/LegalPage";
import { layout, h } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_FILE = 5 * 1024 * 1024; // 5 MB each
const OK_TYPES = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf)$/i;

// POST (form data: name, replyTo, topic, description, files[]) → emails support@lawpower.ai.
// Sent from the person's own connected Outlook / Gmail (so a reply comes straight back to them);
// if that can't send, through Resend when it's set up.
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const orgId = await getCurrentOrgId().catch(() => null);

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Couldn't read the form." }, { status: 400 });
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 120);
  const replyTo = str("replyTo", 320);
  const topic = str("topic", 120) || "Other";
  const description = str("description", 8000);
  const page = str("page", 300);
  if (!name || !description) return NextResponse.json({ error: "Add your name and describe the problem." }, { status: 400 });
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return NextResponse.json({ error: "The reply-to email doesn't look right." }, { status: 400 });

  const attachments: { name: string; mime: string; bytes: Uint8Array }[] = [];
  for (const f of form.getAll("files").slice(0, MAX_FILES)) {
    if (!(f instanceof File) || !f.size) continue;
    if (f.size > MAX_FILE) return NextResponse.json({ error: `“${f.name}” is over 5 MB.` }, { status: 400 });
    if (!OK_TYPES.test(f.type)) return NextResponse.json({ error: `“${f.name}” isn't a picture or PDF.` }, { status: 400 });
    attachments.push({ name: f.name.slice(0, 150), mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }

  const subject = `[LawPower support] ${topic} — ${name}`;
  const rows: [string, string][] = [
    ["From", `${name}${replyTo ? ` <${replyTo}>` : ""}`],
    ["Topic", topic],
    ...(page ? ([["Page", page]] as [string, string][]) : []),
    ["Workspace", orgId ?? "unknown"],
  ];
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${description}\n`;
  const html = layout(
    topic,
    `<table style="font-size:13px;color:#4B5563;margin-bottom:14px">${rows
      .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6B7280">${h(k)}</td><td>${h(v)}</td></tr>`)
      .join("")}</table><div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${h(description)}</div>`,
    "Sent from the Contact support form in LawPower AI.",
  );

  // 1) The person's own mailbox.
  try {
    const { sendFromMailbox, sendingMailbox } = await import("@/lib/mail/sendMail");
    if (await sendingMailbox(userId)) {
      await sendFromMailbox(orgId, userId, { to: [SUPPORT_EMAIL], subject, text, html, attachments }, { kind: "support" });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error("support via mailbox failed, trying Resend:", (e as Error).message);
  }

  // 2) Resend (if set up in Vercel).
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.EMAIL_FROM || "LawPower <notifications@lawpower.ai>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [SUPPORT_EMAIL],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.name, content: Buffer.from(a.bytes).toString("base64") })) } : {}),
      }),
    }).catch(() => null);
    if (res?.ok) return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: `It couldn't be sent from here. Please email ${SUPPORT_EMAIL} directly, or reconnect Outlook once (Settings → Integrations) and allow “Send email”.` },
    { status: 502 },
  );
}
