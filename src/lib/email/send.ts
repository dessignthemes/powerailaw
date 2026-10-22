import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Outgoing email from LawPower itself (not the person's Outlook): task
// assignments and the morning check-in. Sent through Resend; set RESEND_API_KEY
// and EMAIL_FROM (e.g. "LawPower <notifications@lawpower.ai>") in Vercel.
// Without a key nothing is sent and the attempt is logged as "skipped".

export type OutgoingEmail = { orgId: string | null; to: string; subject: string; html: string; text: string; kind: string };

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(mail: OutgoingEmail): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "LawPower <notifications@lawpower.ai>";
  const log = (status: "sent" | "failed" | "skipped", extra: { provider_id?: string; error?: string } = {}) =>
    createAdminClient()
      .from("email_log")
      .insert({ org_id: mail.orgId, to_email: mail.to.slice(0, 320), kind: mail.kind, subject: mail.subject.slice(0, 300), status, ...extra })
      .then(() => undefined, () => undefined); // the log must never break the send
  if (!key) {
    await log("skipped", { error: "RESEND_API_KEY not set" });
    return { ok: false, reason: "Email isn't set up yet (RESEND_API_KEY)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    const d = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      await log("failed", { error: (d.message ?? `HTTP ${res.status}`).slice(0, 500) });
      return { ok: false, reason: d.message ?? `HTTP ${res.status}` };
    }
    await log("sent", { provider_id: d.id });
    return { ok: true };
  } catch (e) {
    await log("failed", { error: String((e as Error).message ?? e).slice(0, 500) });
    return { ok: false, reason: (e as Error).message };
  }
}

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://lawpower.ai").replace(/\/$/, "");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// Plain, readable layout that works in Outlook and Gmail.
export function layout(title: string, bodyHtml: string, footer = "Sent by LawPower AI. You get this because you're a member of your firm's LawPower workspace.") {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F3F4F8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1B191A">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 32px;border:1px solid #E1E5EC">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;margin-bottom:8px">LawPower AI</div>
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${bodyHtml}
<p style="font-size:12px;color:#6B7280;margin-top:28px;border-top:1px solid #E1E5EC;padding-top:14px">${esc(footer)}</p>
</div></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#1B191A;color:#fff;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:600;font-size:14px">${esc(label)}</a></p>`;

export const h = esc;
