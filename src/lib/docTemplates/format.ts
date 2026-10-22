// Document templates (AI Templates): plain text with fill-in fields written as
// {{field_key}}. Light formatting, which the Word export understands:
//   # Title line            centered, bold, underlined (e.g. "# DEED")
//   ## Heading              bold line
//   **bold** inside a line  bold words (e.g. "**Consideration.** This transfer…")
//   ::centered line         centered line
//   >>right-aligned line    right-aligned line (signatures, "referred to as the Grantor,")
//   ---                     page break
//   blank line              new paragraph
// Everything else is a normal paragraph.

export type TemplateField = {
  key: string; // snake_case, used as {{key}}
  label: string; // shown to the person filling it in
  hint?: string; // what goes here / where it comes from
  example?: string; // e.g. "Paul Montesano and Marilyn Montesano"
};

export type DocTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  body: string;
  fields: TemplateField[];
  source: "ai" | "paste" | "upload" | "blank" | "sample";
  updatedAt: string;
  sample?: boolean; // built-in example; copy it to change it
};

export const TEMPLATE_CATEGORIES = ["Real Estate", "Estate Planning", "Probate", "Immigration", "Litigation", "Family Law", "Business / Corporate", "Letters", "Agreements", "Other"];

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,48}$/;
export const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export const toKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]/, "f$&")
    .slice(0, 49) || "field";

export const labelOf = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Every {{key}} used in the body, in order of first use.
export function keysInBody(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(PLACEHOLDER)) {
    const k = m[1];
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

// Fields list kept in step with the body: one entry per {{key}} in use (keeping
// labels/hints already written), in the order they appear.
export function syncFields(body: string, fields: TemplateField[]): TemplateField[] {
  const known = new Map(fields.map((f) => [f.key, f]));
  return keysInBody(body).map((k) => known.get(k) ?? { key: k, label: labelOf(k) });
}

// Fills a body with values; missing ones are left as a visible blank.
export function fillBody(body: string, values: Record<string, string>, blank = "__________"): string {
  return body.replace(PLACEHOLDER, (_, k: string) => {
    const v = values[k];
    return v && v.trim() ? v : blank;
  });
}

// Tidies what the browser / AI sends.
export function cleanFields(raw: unknown): TemplateField[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateField[] = [];
  const seen = new Set<string>();
  for (const x of raw.slice(0, 120)) {
    const r = (x ?? {}) as Record<string, unknown>;
    const key = toKey(String(r.key ?? ""));
    if (!FIELD_KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
    out.push({ key, label: s(r.label, 80) || labelOf(key), ...(s(r.hint, 200) ? { hint: s(r.hint, 200) } : {}), ...(s(r.example, 160) ? { example: s(r.example, 160) } : {}) });
  }
  return out;
}

// Fields the firm's data can usually fill in by itself (shown in "Insert field").
export const COMMON_FIELDS: TemplateField[] = [
  { key: "today_date", label: "Today's date", hint: "e.g. October 21, 2026" },
  { key: "firm_name", label: "Firm name" },
  { key: "attorney_name", label: "Attorney name" },
  { key: "client_name", label: "Client name" },
  { key: "client_address", label: "Client address" },
  { key: "client_email", label: "Client email" },
  { key: "client_phone", label: "Client phone" },
  { key: "matter_number", label: "Matter number", hint: "e.g. REP-2026-3711" },
  { key: "matter_title", label: "Matter title" },
  { key: "property_address", label: "Property address" },
  { key: "purchase_price", label: "Purchase price", hint: "e.g. $612,500.00" },
  { key: "closing_date", label: "Closing date" },
  { key: "other_party_name", label: "Other party name" },
  { key: "other_party_attorney", label: "Other party's attorney" },
  { key: "county", label: "County" },
  { key: "municipality", label: "Municipality (town)" },
];
