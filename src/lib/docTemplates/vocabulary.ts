// One shared set of field names, so every template uses the same key for the
// same thing (client_name everywhere) and LawPower can fill it from the matter.
export type FieldType = "text" | "date" | "currency" | "number" | "select" | "yes_no";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Amount ($)" },
  { value: "number", label: "Number" },
  { value: "select", label: "Choice" },
  { value: "yes_no", label: "Yes / no (optional clause)" },
];

export const VOCABULARY: { key: string; label: string; type: FieldType }[] = [
  { key: "client_name", label: "Client name", type: "text" },
  { key: "client_address", label: "Client address", type: "text" },
  { key: "client_email", label: "Client email", type: "text" },
  { key: "client_phone", label: "Client phone", type: "text" },
  { key: "matter_number", label: "Matter number", type: "text" },
  { key: "matter_title", label: "Matter title", type: "text" },
  { key: "today_date", label: "Today's date", type: "date" },
  { key: "firm_name", label: "Firm name", type: "text" },
  { key: "attorney_name", label: "Attorney name", type: "text" },
  { key: "buyer_names", label: "Buyer(s)", type: "text" },
  { key: "seller_names", label: "Seller(s)", type: "text" },
  { key: "property_address", label: "Property address", type: "text" },
  { key: "block_lot", label: "Block and lot", type: "text" },
  { key: "purchase_price", label: "Purchase price", type: "currency" },
  { key: "deposit_amount", label: "Deposit amount", type: "currency" },
  { key: "loan_amount", label: "Loan amount", type: "currency" },
  { key: "contract_date", label: "Contract date", type: "date" },
  { key: "closing_date", label: "Closing date", type: "date" },
  { key: "lender_name", label: "Lender", type: "text" },
  { key: "title_company", label: "Title company", type: "text" },
  { key: "opposing_counsel", label: "Opposing counsel", type: "text" },
  { key: "opposing_party", label: "Opposing party", type: "text" },
  { key: "court_name", label: "Court", type: "text" },
  { key: "docket_number", label: "Docket number", type: "text" },
  { key: "county", label: "County", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "decedent_name", label: "Decedent", type: "text" },
  { key: "executor_name", label: "Executor", type: "text" },
  { key: "beneficiary_names", label: "Beneficiaries", type: "text" },
  { key: "grantor_name", label: "Grantor", type: "text" },
  { key: "grantee_name", label: "Grantee", type: "text" },
];

// Patterns that are almost always fill-in fields.
const PATTERNS: { re: RegExp; key: string; label: string; type: FieldType }[] = [
  { re: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\s?\d+(?:\.\d{2})?/g, key: "amount", label: "Amount", type: "currency" },
  { re: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/g, key: "date", label: "Date", type: "date" },
  { re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, key: "date", label: "Date", type: "date" },
  { re: /\b[A-Z]{2,4}-[A-Z]?-?\d{3,7}-\d{2}\b/g, key: "docket_number", label: "Docket number", type: "text" },
  { re: /\bBlock\s+\d+[A-Z]?(?:\.\d+)?,?\s+Lots?\s+\d+[A-Z]?(?:\.\d+)?\b/gi, key: "block_lot", label: "Block and lot", type: "text" },
  { re: /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Place|Pl\.?|Court|Ct\.?|Way|Terrace|Parkway)\b(?:,?\s+(?:[A-Z][a-z]+\s?){1,3},?\s+(?:NJ|New Jersey|NY|New York|PA)\s*\d{5})?/g, key: "address", label: "Address", type: "text" },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, key: "email", label: "Email", type: "text" },
  { re: /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, key: "phone", label: "Phone", type: "text" },
];

export type Suggestion = { text: string; count: number; key: string; label: string; type: FieldType; source: "pattern" | "ai"; why?: string };

export function patternSuggestions(paragraphs: string[]): Suggestion[] {
  const full = paragraphs.join("\n");
  const found = new Map<string, Suggestion>();
  for (const p of PATTERNS) {
    for (const m of full.matchAll(p.re)) {
      const text = m[0].trim().replace(/[,.]$/, "");
      if (text.length < 4 || text.includes("{{")) continue;
      const s = found.get(text);
      if (s) continue;
      found.set(text, { text, count: 0, key: p.key, label: p.label, type: p.type, source: "pattern" });
    }
  }
  for (const s of found.values()) s.count = full.split(s.text).length - 1;
  // Number repeated generic keys: date, date_2…
  const seen = new Map<string, number>();
  const list = [...found.values()].sort((a, b) => b.count - a.count || full.indexOf(a.text) - full.indexOf(b.text));
  for (const s of list) {
    const n = (seen.get(s.key) ?? 0) + 1;
    seen.set(s.key, n);
    if (n > 1) s.key = `${s.key}_${n}`;
  }
  return list.slice(0, 40);
}

export const countIn = (paragraphs: string[], text: string) => (text ? paragraphs.join("\n").split(text).length - 1 : 0);
