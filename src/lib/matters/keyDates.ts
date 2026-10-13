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
export const isField = (k: unknown): k is KeyDateField => typeof k === "string" && (FIELD_KEYS as string[]).includes(k);

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

export type KeyDatesState = {
  dates: Partial<Record<KeyDateField, KeyDate>>;
  facts?: KeyFacts;
  documents?: ReadDocument[]; // in the order they were applied (oldest first)
  notes?: string[];
  read?: Partial<Record<KeyDateField, KeyDate>>; // the dates as read from the documents (Reset goes back to these)
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
  for (const k of FIELD_KEYS) if (dates[k]) out[k] = { ...dates[k]! };
  for (let pass = 0; pass < FIELD_KEYS.length; pass++) {
    for (const k of FIELD_KEYS) {
      const d = out[k];
      if (!d || d.manual || !d.from || typeof d.days !== "number") continue;
      const base = out[d.from]?.date;
      d.date = isYmd(base) ? addDays(base, d.days, !!d.businessDays) : null;
    }
  }
  return out;
}

// Dates in the form task checklists use: { "Closing date": "2026-11-20", ... }.
export function anchorDates(dates: KeyDatesState["dates"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of KEY_DATE_FIELDS) {
    const v = dates[f.key]?.date;
    if (isYmd(v)) out[f.anchor] = v;
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
