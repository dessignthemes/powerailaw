import { layoutFor, type MatterDetails } from "@/lib/matters/details";

// The subject a new email on a matter starts with:
//   Purchase (REP): "Maciejewski from Klag & Quinonez: 205 Arizona Drive, Brick, NJ 08723 - REP-2026-3718"
//   Sale (RES):     "Smith to Jones: 12 Main St, Toms River, NJ - RES-2026-0101"
//   Anything else:  "[EST-2026-0007] John Smith"
// The matter number stays in the subject, so replies are filed to the matter.

const COMPANY = /\b(llc|l\.l\.c|inc|corp|corporation|company|co\.|trust|estate|bank|association|partners|lp|llp)\b/i;
const HONORIFIC = /^(mr|mrs|ms|miss|dr)\.?\s+/i;
const SUFFIX = /,?\s+(jr|sr|ii|iii|iv|esq)\.?$/i;

// "Robert Klag, Alex Quinonez" → "Klag & Quinonez"; "Joseph & Brenna Zambardi" → "Zambardi".
export function lastNames(names: string): string {
  const pieces = names
    .split(/,|;|&|\band\b|\//i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  const multiWord = pieces.some((p) => p.replace(HONORIFIC, "").split(/\s+/).length > 1);
  for (const p of pieces) {
    if (COMPANY.test(p)) {
      out.push(p);
      continue;
    }
    const words = p.replace(HONORIFIC, "").replace(SUFFIX, "").split(/\s+/).filter(Boolean);
    if (!words.length || (words.length === 1 && multiWord)) continue; // "Joseph" in "Joseph & Brenna Zambardi"
    out.push(words[words.length - 1]);
  }
  return [...new Set(out)].join(" & ");
}

export const plainName = (name: string) => name.replace(HONORIFIC, "").trim();

export function matterEmailSubject(
  m: { title: string; matterCode?: string | null; category?: string | null },
  number: string | null,
  details: MatterDetails | null,
  clientName: string | null
): string {
  const { side } = layoutFor(m);
  const v = (k: string) => details?.[k]?.value?.trim() ?? "";
  const tail = number ? ` - ${number}` : "";
  if (side) {
    const buyer = lastNames(v("buyerNames"));
    const seller = lastNames(v("sellerNames"));
    const address = v("property");
    const [ours, word, other] = side === "buyer" ? [buyer, "from", seller] : [seller, "to", buyer];
    const parties = ours && other ? `${ours} ${word} ${other}` : ours || other;
    if (parties || address) return `${[parties, address].filter(Boolean).join(": ")}${tail}`;
  }
  const who = clientName ? plainName(clientName) : m.title;
  return number ? `[${number}] ${who}` : who;
}
