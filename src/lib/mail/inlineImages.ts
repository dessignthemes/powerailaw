// Inline images (a logo in a signature, a picture pasted into the message) are
// referenced in an email's HTML as "cid:<content id>" and sent as hidden
// attachments. They're part of the email itself (not tracking images from the
// internet), so they're put straight into the HTML as data: images.

export const MAX_INLINE_IMAGE = 3 * 1024 * 1024; // per image
export const MAX_INLINE_TOTAL = 8 * 1024 * 1024; // per email

const norm = (cid: string) => cid.trim().replace(/^<|>$/g, "").toLowerCase();

// Content ids referenced by the HTML.
export function cidsIn(html: string | null): Set<string> {
  const out = new Set<string>();
  if (!html) return out;
  for (const m of html.matchAll(/cid:([^"'\s)>]+)/gi)) out.add(norm(decodeURIComponent(m[1])));
  return out;
}

export function replaceCids(html: string, images: Map<string, { mime: string; base64: string }>): string {
  if (!images.size) return html;
  return html.replace(/cid:([^"'\s)>]+)/gi, (whole, raw: string) => {
    const img = images.get(norm(decodeURIComponent(raw)));
    return img ? `data:${img.mime || "image/png"};base64,${img.base64}` : whole;
  });
}

export { norm as normalizeCid };
