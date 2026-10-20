// Matter numbers: <ABBREVIATION>-<YEAR>-<RUNNING NUMBER>, e.g. REP-2026-0001.
// The database assigns the number when the matter is saved (migration 0025).

// Abbreviations offered for each matter type. The firm can type any other.
export const SUGGESTED_CODES: Record<string, { code: string; label: string }[]> = {
  "Real Estate": [
    { code: "REP", label: "Purchase" },
    { code: "RES", label: "Sale" },
    { code: "REF", label: "Refinance" },
  ],
  Litigation: [{ code: "LIT", label: "Litigation" }],
  "Estate Planning": [{ code: "EP", label: "Estate planning" }],
  Probate: [{ code: "PRO", label: "Probate" }],
  "Family Law": [{ code: "FAM", label: "Family law" }],
  Immigration: [{ code: "IMM", label: "Immigration" }],
  "Personal Injury": [{ code: "PI", label: "Personal injury" }],
  "Criminal Defense": [{ code: "CRIM", label: "Criminal defense" }],
  "Business / Corporate": [{ code: "BUS", label: "Business" }],
};

// 2–6 characters, letters first (REP, RES, LIT, EP …).
export const CODE_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

export function cleanCode(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function isValidCode(v: unknown): boolean {
  return CODE_PATTERN.test(cleanCode(v));
}

export function formatMatterNumber(code: string, year: number, seq: number): string {
  return `${code}-${year}-${String(seq).padStart(4, "0")}`;
}

// Codes for a template field typed as "REP, RES".
export function parseCodes(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? "").split(/[\s,;]+/);
  const out: string[] = [];
  for (const x of list) {
    const c = cleanCode(x);
    if (CODE_PATTERN.test(c) && !out.includes(c)) out.push(c);
  }
  return out.slice(0, 20);
}

// A full matter number like REP-2026-3709 (for typing your own number).
export const NUMBER_PATTERN = /^[A-Z][A-Z0-9]{1,5}-\d{4}-\d{1,9}$/;
export function cleanNumber(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/\s+/g, "").slice(0, 24);
}
