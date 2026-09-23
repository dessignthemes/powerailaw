import { createHash } from "node:crypto";

// ── Memory content guard ──────────────────────────────────────────────────
// Memories must never hold credentials or unnecessary sensitive identifiers.
const SENSITIVE: { re: RegExp; why: string }[] = [
  { re: /\b(pass(word|code|phrase)?|pwd|pin)\b\s*[:=]?\s*\S{3,}/i, why: "a password or PIN" },
  { re: /\b(api[_ -]?key|secret|token|bearer|private[_ -]?key)\b\s*[:=]?\s*\S{6,}/i, why: "an API key, token or secret" },
  { re: /\b(sk|pk|rk|ghp|gho|github_pat|xox[abp]|AKIA|AIza)[-_A-Za-z0-9]{12,}/, why: "an API key or token" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: "a private key" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, why: "a Social Security number" },
  { re: /\b(?:\d[ -]?){13,19}\b/, why: "a payment card or account number" },
];

export function sensitiveReason(text: string): string | null {
  for (const { re, why } of SENSITIVE) if (re.test(text)) return why;
  return null;
}

// ── Action binding ────────────────────────────────────────────────────────
// Stable hash of the exact proposed arguments; re-checked at confirmation.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce((o, k) => ({ ...o, [k]: canonical((v as Record<string, unknown>)[k]) }), {} as Record<string, unknown>);
  }
  return v;
}

export function argsHash(userId: string, tool: string, args: unknown): string {
  return createHash("sha256").update(JSON.stringify([userId, tool, canonical(args)])).digest("hex");
}

// ── Search query ──────────────────────────────────────────────────────────
// Turn a natural-language question into an OR query for websearch_to_tsquery,
// so partial matches still rank instead of requiring every word.
const STOP = new Set(
  "the a an and or of to in on for with what is are was were be been does do did can could should would will this that these those it its about from by as at into how who whom which when where why please show tell me my our your their any all there here".split(
    " "
  )
);

export function toSearchQuery(text: string, max = 14): string | null {
  const words = (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? [])
    .map((w) => w.replace(/'s$/, "").replace(/['-]/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));
  const uniq = [...new Set(words)].slice(0, max);
  return uniq.length ? uniq.join(" or ") : null;
}

// ── Citations ─────────────────────────────────────────────────────────────
export function citedSourceIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\[(S\d{1,3})\]/g)) ids.add(m[1]);
  return [...ids];
}

// Excerpts are wrapped so the model treats them as data, not instructions.
export function wrapUntrusted(sourceId: string, label: string, content: string) {
  const safe = content.replace(/<\/?(document_excerpt|system|instructions?)[^>]*>/gi, "");
  return `<document_excerpt source="${sourceId}" ref="${label.replace(/"/g, "'")}">\n${safe}\n</document_excerpt>`;
}
