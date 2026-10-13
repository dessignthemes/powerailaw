// Key dates of a matter (shared by browser and server).
// Each date is either written in a document, worked out from a rule
// ("30 days after attorney review is completed"), or entered by hand.

export type KeyDateField =
  | "contractSigned"
  | "attorneyReviewCompleted"
  | "initialDeposit"
  | "secondDeposit"
  | "inspection"
  | "appraisal"
  | "mortgage"
  | "closing";

// anchor = the critical-date name task checklists use (see COMMON_ANCHORS).
export const KEY_DATE_FIELDS: { key: KeyDateField; label: string; anchor: string; letter: string }[] = [
  { key: "contractSigned", label: "Contract signed", anchor: "Contract signed date", letter: "Contract fully signed" },
  { key: "attorneyReviewCompleted", label: "Attorney review completed", anchor: "Attorney review completed date", letter: "Attorney review concluded" },
  { key: "initialDeposit", label: "Initial deposit due", anchor: "Initial deposit due date", letter: "Initial deposit due" },
  { key: "secondDeposit", label: "Additional deposit due", anchor: "Second deposit due date", letter: "Additional deposit due" },
  { key: "inspection", label: "Home inspection contingency", anchor: "Home inspection contingency date", letter: "Home inspection contingency" },
  { key: "appraisal", label: "Appraisal contingency", anchor: "Appraisal contingency date", letter: "Appraisal contingency" },
  { key: "mortgage", label: "Mortgage contingency", anchor: "Mortgage contingency date", letter: "Mortgage commitment contingency" },
  { key: "closing", label: "Closing", anchor: "Closing date", letter: "Closing date (on or about)" },
];
export const FIELD_KEYS = KEY_DATE_FIELDS.map((f) => f.key);
export const isField = (k: unknown): k is KeyDateField => typeof k === "string" && (FIELD_KEYS as string[]).includes(k)
// Fields a firm adds itself ("Custody hearing", "Mediation"): key c_xxxx, entered by hand or read by the AI by name.
export const isCustomKey = (k: unknown): k is string => typeof k === "string" && /^c_[a-z0-9]{4,24}$/.test(k);
export const isDateKey = (k: unknown): k is string => isField(k) || isCustomKey(k);;

export type KeyDate = {
  date: string | null; // YYYY-MM-DD (explicit, or worked out from the rule)
  days?: number | null; // rule: this many days ...
  businessDays?: boolean; // ... counting only Mon–Fri
  from?: KeyDateField | null; // ... after this other date
  source?: string | null; // document title it came from
  sourceDate?: string | null; // that document's date
  quote?: string | null; // short wording from the document
  changedBy?: string[]; // later documents that changed it
  manual?: boolean; // entered by hand: never overwritten by a new reading
  na?: boolean; // not applicable (mortgage on a cash deal)
};

export type KeyFacts = {
  property?: string;
  buyers?: string[];
  sellers?: string[];
  purchasePrice?: string;
  initialDeposit?: string;
  additionalDeposit?: string;
  mortgageAmount?: string;
  cash?: boolean; // cash purchase: no mortgage contingency
};

export type ReadDocument = { title: string; type: string; date: string | null; summary: string; readable: boolean };

// Built-in fields (contractSigned, closing …) and the firm's own (c_xxxx).
export type DatesMap = Record<string, KeyDate | undefined>;

export type KeyDatesState = {
  dates: DatesMap;
  facts?: KeyFacts;
  documents?: ReadDocument[]; // in the order they were applied (oldest first)
  notes?: string[];
  read?: DatesMap; // the dates as read from the documents (Reset goes back to these)
  fingerprint?: string; // which document versions were read
  extractedAt?: string;
  runningSince?: string | null;
  letter?: { documentId: string; fingerprint: string; generatedAt: string; version: number; missing?: string[] } | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (v: unknown): v is string => typeof v === "string" && YMD.test(v);

function addDays(ymd: string, days: number, business: boolean): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!business) dt.setUTCDate(dt.getUTCDate() + days);
  else {
    let left = Math.abs(days);
    const step = days < 0 ? -1 : 1;
    while (left > 0) {
      dt.setUTCDate(dt.getUTCDate() + step);
      const wd = dt.getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
  }
  return dt.toISOString().slice(0, 10);
}

// Works out every rule-based date from the dates it depends on.
// Explicit and hand-entered dates are kept as they are.
export function resolveDates(dates: KeyDatesState["dates"]): KeyDatesState["dates"] {
  const out: KeyDatesState["dates"] = {};
  const keys = Object.keys(dates).filter((k) => dates[k] && isDateKey(k));
  for (const k of keys) out[k] = { ...dates[k]! };
  for (let pass = 0; pass < keys.length; pass++) {
    for (const k of keys) {
      const d = out[k];
      if (!d || d.manual || !d.from || typeof d.days !== "number") continue;
      const base = out[d.from]?.date;
      d.date = isYmd(base) ? addDays(base, d.days, !!d.businessDays) : null;
    }
  }
  return out;
}

// Dates in the form task checklists use: { "Closing date": "2026-11-20", ... }.
// The firm's own fields use their name ("Custody hearing").
export function anchorDates(dates: KeyDatesState["dates"], fields: FieldDef[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of KEY_DATE_FIELDS) {
    const v = dates[f.key]?.date;
    if (isYmd(v)) out[f.anchor] = v;
  }
  for (const f of fields) {
    const v = dates[f.key]?.date;
    if (isCustomKey(f.key) && isYmd(v)) out[f.label] = v;
  }
  return out;
}

export function ruleText(d: KeyDate): string | null {
  if (!d.from || typeof d.days !== "number") return null;
  const from = KEY_DATE_FIELDS.find((f) => f.key === d.from)?.label.toLowerCase() ?? d.from;
  const n = Math.abs(d.days);
  const unit = d.businessDays ? (n === 1 ? "business day" : "business days") : n === 1 ? "day" : "days";
  return `${n} ${unit} ${d.days < 0 ? "before" : "after"} ${from}`;
}

export const usDate = (ymd: string | null | undefined) =>
  isYmd(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}` : "";

// Matter types the dates are read for automatically.
export const AUTO_CODES = ["REP", "RES", "REF"];
// Cash deal: the mortgage contingency is marked not applicable.
export const isCashDeal = (s: KeyDatesState | null | undefined) => !!s?.dates.mortgage?.na;

export const isRealEstate = (m: { category?: string | null; matterCode?: string | null }) =>
  m.category === "Real Estate" || AUTO_CODES.includes(m.matterCode ?? "");

// ── Which fields a matter shows ──────────────────────────────────────────────
// Real estate matters show every built-in field; other matter types start with
// contract signed, attorney review completed and initial deposit. A firm can
// rename, remove and add fields per matter type (organizations.key_date_layouts).

export type FieldDef = { key: string; label: string };
export type Layouts = Record<string, FieldDef[]>;

const std = (keys: KeyDateField[]): FieldDef[] => keys.map((k) => ({ key: k, label: KEY_DATE_FIELDS.find((f) => f.key === k)!.label }));
export const REAL_ESTATE_FIELDS = std(FIELD_KEYS);
export const OTHER_FIELDS = std(["contractSigned", "attorneyReviewCompleted", "initialDeposit"]);

// The matter type a field list belongs to ("Real Estate", "Family Law", … or "Other").
export function layoutKey(m: { category?: string | null; matterCode?: string | null }): string {
  if (isRealEstate(m)) return "Real Estate";
  // ("_…" keys are reserved for the firm's reusable field list.)
  return m.category && m.category !== "None" && !m.category.startsWith("_") ? m.category.slice(0, 60) : "Other";
}

export function standardFields(m: { category?: string | null; matterCode?: string | null }): FieldDef[] {
  return isRealEstate(m) ? REAL_ESTATE_FIELDS : OTHER_FIELDS;
}

export function cleanFields(input: unknown): FieldDef[] | null {
  if (!Array.isArray(input)) return null;
  const out: FieldDef[] = [];
  for (const x of input.slice(0, 30)) {
    const f = (x ?? {}) as { key?: unknown; label?: unknown };
    const label = typeof f.label === "string" ? f.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!label || !isDateKey(f.key) || out.some((o) => o.key === f.key)) continue;
    out.push({ key: f.key as string, label });
  }
  return out;
}

export function fieldsFor(m: { category?: string | null; matterCode?: string | null }, layouts: Layouts | null | undefined): FieldDef[] {
  const custom = cleanFields(layouts?.[layoutKey(m)]);
  return custom ?? standardFields(m);
}

export const newCustomKey = () => `c_${Math.random().toString(36).slice(2, 10)}`;
