import type { MailMessage } from "@/lib/mail/types";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Email HTML runs in a sandboxed iframe: no scripts, no access to the app,
// links open in a new tab, and remote images stay blocked until the person
// asks for them (they're often used to track when an email is opened).
export function emailDocument(msg: MailMessage, showImages: boolean) {
  const img = showImages ? "img-src data: cid: https: http:;" : "img-src data: cid:;";
  const csp = `default-src 'none'; ${img} style-src 'unsafe-inline' https:; font-src https: data:;`;
  const body = msg.html ?? `<pre style="white-space:pre-wrap;font:14px/1.55 -apple-system,Segoe UI,Arial,sans-serif;margin:0">${escapeHtml(msg.text ?? "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:20px 24px;font:14px/1.55 -apple-system,"Segoe UI",Arial,sans-serif;color:#1a1917;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${body}</body></html>`;
}


// Dark mode for an email: the frame showing it is turned negative (CSS filter on the iframe),
// so the email gets a warm-grey page that comes out as LawPower's dark panel colour, and
// pictures are turned back so they keep their real colours.
export const DARK_FRAME_FILTER = "invert(1) hue-rotate(180deg)";
export function withDarkMode(doc: string, dark: boolean) {
  if (!dark || !doc) return doc;
  const css =
    "<style>html,body{background:#E4E2DD!important}" +
    "img,video,picture,svg,canvas,[style*='background-image'],[background]{filter:invert(1) hue-rotate(180deg)}</style>";
  return doc.includes("</head>") ? doc.replace("</head>", `${css}</head>`) : css + doc;
}
