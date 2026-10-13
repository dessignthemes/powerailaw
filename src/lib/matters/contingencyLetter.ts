import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { usDate, type KeyDatesState } from "@/lib/matters/keyDates";
import type { MatterDetails } from "@/lib/matters/details";

// The firm's Contingency Dates Letter (src/templates/contingency-dates-letter.docx,
// converted from the firm's own LEAP letter by scripts/build_contingency_template.py).
// Every {{PLACEHOLDER}} is filled from the matter: Key dates (contract as the base,
// changed only by the last attorney review letter / rider / addendum), Details, and
// the client card.

export type LetterClient = { addressee: string; addressLines: string[]; dear: string } | null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SUFFIX = /^(jr|sr|ii|iii|iv|esq)\.?$/i;
// "John Smith, Jane Smith" → "Smith"; "Ann Lee, Bob Park" → "Lee & Park".
export function lastNames(names: string | undefined): string {
  const out: string[] = [];
  for (const n of (names ?? "").split(/,|&|\band\b/i)) {
    const words = n.trim().split(/\s+/).filter((w) => w && !SUFFIX.test(w));
    const last = words[words.length - 1];
    if (last && !out.includes(last)) out.push(last);
  }
  return out.join(" & ");
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Values for every placeholder, plus the letter items that are still missing.
export function letterValues(
  state: KeyDatesState,
  details: MatterDetails,
  opts: { fileNo: string; date: string; client: LetterClient; signer?: string; initials?: string }
) {
  const d = state.dates;
  const f = state.facts ?? {};
  const v = (k: string) => details[k]?.value?.trim() ?? "";
  const total = v("totalDeposit") || (amount(v("deposit1")) + amount(v("deposit2")) ? money(amount(v("deposit1")) + amount(v("deposit2"))) : f.initialDeposit || "");
  const depositDue = d.secondDeposit?.date ?? d.initialDeposit?.date ?? null;
  const values: Record<string, string> = {
    DATE: opts.date,
    DELIVERY: "",
    ADDRESSEE: opts.client?.addressee ?? "",
    ADDRESS: (opts.client?.addressLines ?? []).join("\n"),
    DEAR: opts.client?.dear ?? "",
    SELLER_LAST: lastNames(v("sellerNames") || f.sellers?.join(", ")),
    BUYER_LAST: lastNames(v("buyerNames") || f.buyers?.join(", ")),
    PROPERTY: v("property") || f.property || "",
    FILE_NO: opts.fileNo,
    AR_DATE: usDate(d.attorneyReviewCompleted?.date),
    DEPOSIT_AMOUNT: total ? ` ${total}` : "",
    DEPOSIT_DUE: usDate(depositDue),
    DEPOSIT_PAYABLE_TO: v("depositPayableTo"),
    DEPOSIT_MAILED_TO: v("depositMailedTo"),
    INSPECTION_DATE: usDate(d.inspection?.date),
    MORTGAGE_DATE: d.mortgage?.na ? "N/A (cash purchase)" : usDate(d.mortgage?.date),
    CLOSING_DATE: usDate(d.closing?.date),
    SIGNER: opts.signer ?? "Piotr Rapciewicz, Esq.",
    INITIALS: opts.initials ?? "PR/pg",
  };
  const labels: Record<string, string> = {
    ADDRESSEE: "addressee",
    DEAR: "salutation",
    PROPERTY: "property",
    AR_DATE: "attorney review date",
    DEPOSIT_AMOUNT: "deposit amount",
    DEPOSIT_DUE: "deposit due date",
    DEPOSIT_PAYABLE_TO: "deposit payable to",
    DEPOSIT_MAILED_TO: "deposit mailed to",
    INSPECTION_DATE: "inspection date",
    MORTGAGE_DATE: "mortgage commitment date",
    CLOSING_DATE: "closing date",
  };
  const missing = Object.entries(labels)
    .filter(([k]) => !values[k].trim())
    .map(([, label]) => label);
  return { values, missing };
}

// Replaces {{KEY}} inside a run's text; line breaks become <w:br/>.
function fill(xml: string, values: Record<string, string>) {
  return xml.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key: string) =>
    (values[key] ?? "")
      .split("\n")
      .map(esc)
      .join('</w:t><w:br/><w:t xml:space="preserve">')
  );
}

export async function buildContingencyLetter(
  state: KeyDatesState,
  details: MatterDetails,
  opts: { fileNo: string; date: string; client: LetterClient }
): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), "src", "templates", "contingency-dates-letter.docx")));
  const files = unzipSync(bytes);
  const { values, missing } = letterValues(state, details, opts);
  for (const name of Object.keys(files)) {
    if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(name)) files[name] = strToU8(fill(strFromU8(files[name]), values));
  }
  return { bytes: zipSync(files, { level: 6 }), missing };
}
