import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { signatureForEmail, signatureText } from "@/lib/mail/signatureHtml";

// A person's email signature (Settings → Mail automation): formatted HTML with
// fonts, colours, links and pictures (logos are stored in the "email-signatures"
// bucket and served from lawpower.ai). Added under the message when they send
// from LawPower, unless they untick it for that email.

export const SIGNATURE_MAX = 60_000; // characters of HTML

export type Signature = { on: boolean; html: string };

// Defence in depth: the signature is only ever shown in the editor (which keeps
// just the formatting it knows) or in a script-free frame, and goes out in the
// person's own email. Still, drop anything that could run code.
export function cleanSignatureHtml(raw: unknown): string {
  let h = String(raw ?? "");
  h = h.replace(/<!--[\s\S]*?-->/g, "");
  h = h.replace(/<(script|style|iframe|object|embed|form|textarea|select|button|noscript|template|svg|math|frameset|frame|title|head)\b[\s\S]*?<\/\1\s*>/gi, "");
  h = h.replace(/<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|noscript|template|svg|math|link|meta|base|frameset|frame|html|head|body|title)\b[^>]*>/gi, "");
  h = h.replace(/<\/?[a-z]+:[a-z]+\b[^>]*>/gi, ""); // Office tags such as <o:p>
  h = h.replace(/<\?[\s\S]*?\?>/g, "");
  h = h.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  h = h.replace(/\s(href|src|action|formaction|xlink:href|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (all, name: string, _q, dq?: string, sq?: string, bare?: string) => {
    const v = (dq ?? sq ?? bare ?? "").replace(/&#x?[0-9a-f]+;?|&colon;|[\s\u0000-\u001f]/gi, (m) => (/colon/i.test(m) || /^&#(x3a|58);?$/i.test(m) ? ":" : "")).toLowerCase();
    const ok = name.toLowerCase() === "href" ? /^(https?:|mailto:|tel:|#)/.test(v) : name.toLowerCase() === "src" ? /^https?:/.test(v) : false;
    return ok ? all : "";
  });
  h = h.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (all) => (/expression\s*\(|javascript:|behavior\s*:|-moz-binding|url\s*\(/i.test(all) ? "" : all));
  return h.trim().slice(0, SIGNATURE_MAX);
}

export async function getSignature(userId: string): Promise<Signature & { ready: boolean }> {
  const { data, error } = await createAdminClient().from("profiles").select("email_signature_html, email_signature_on").eq("id", userId).maybeSingle();
  if (error) return { on: false, html: "", ready: false }; // migration 0056 not run yet
  const row = data as { email_signature_html?: string | null; email_signature_on?: boolean | null } | null;
  return { on: row?.email_signature_on !== false, html: row?.email_signature_html ?? "", ready: true };
}

// What goes into an email: the HTML block and its plain-text twin.
export async function signatureForSending(userId: string): Promise<{ html: string; text: string } | null> {
  const s = await getSignature(userId);
  if (!s.html.trim()) return null;
  const html = signatureForEmail(s.html);
  const text = signatureText(s.html);
  return html ? { html, text } : null;
}
