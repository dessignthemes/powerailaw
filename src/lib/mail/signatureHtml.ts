// Shared by the browser (previews) and the server (sending): turns the editor's
// HTML into email-ready HTML. Mail apps add space around paragraphs, so every
// line gets margin:0 (an empty line keeps its height), and the whole block gets
// the default font used in the editor.

export const SIGNATURE_FONT = "Arial, Helvetica, sans-serif";
export const SIGNATURE_SIZE = "14px";

const addStyle = (attrs: string, style: string) => {
  const m = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
  if (!m) return `${attrs} style="${style}"`;
  return attrs.replace(m[0], ` style="${style};${m[1]}"`);
};

export function signatureForEmail(html: string): string {
  const body = (html ?? "").trim();
  if (!body || !/[^\s]/.test(body.replace(/<[^>]+>/g, "")) && !/<img\b/i.test(body)) return "";
  const out = body
    .replace(/<p(\s[^>]*)?>\s*<\/p>/gi, (_m, a = "") => `<p${addStyle(a, "margin:0")}><br></p>`)
    .replace(/<p(\s[^>]*)?>/gi, (m, a = "") => (/margin\s*:\s*0/.test(m) ? m : `<p${addStyle(a, "margin:0")}>`))
    .replace(/<img(\s[^>]*?)\/?>/gi, (_m, a = "") => `<img${addStyle(a, "border:0;max-width:100%;height:auto")}>`)
    .replace(/<hr(\s[^>]*?)?\/?>/gi, (_m, a = "") => `<hr${addStyle(a, "border:0;border-top:1px solid #C9CED6;margin:8px 0")}>`)
    .replace(/<ul(\s[^>]*)?>/gi, (_m, a = "") => `<ul${addStyle(a, "margin:0;padding-left:1.4em")}>`);
  return `<div class="lp-signature" style="margin-top:18px;font-family:${SIGNATURE_FONT};font-size:${SIGNATURE_SIZE};line-height:1.4;color:#222222">${out}</div>`;
}

export function signatureText(html: string): string {
  return (html ?? "")
    .replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const t = inner.replace(/<[^>]+>/g, "").trim();
      return t && t.replace(/^https?:\/\//, "").replace(/\/$/, "") !== href.replace(/^https?:\/\//, "").replace(/\/$/, "") ? `${t} (${href})` : t || href;
    })
    .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n————————\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A full page for a script-free preview frame (Settings and the compose window).
export function signaturePreviewDoc(html: string): string {
  const block = signatureForEmail(html);
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff}body{padding:2px 4px}.lp-signature{margin-top:0!important}a{color:#0563C1}</style></head><body>${block}</body></html>`;
}
