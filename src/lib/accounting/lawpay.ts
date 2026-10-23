import { parseCsv, parseMoney, parseDate } from "@/lib/accounting/core";

// Reads a LawPay transactions export (CSV). Column names vary a little between
// LawPay reports, so each field is found by the usual names.

export type LawPayRow = {
  ref: string; // LawPay transaction id, or a stable stand-in
  date: string; // yyyy-mm-dd
  amount: number; // positive
  fee: number; // processing fee on this payment (0 when not in the file)
  type: "payment" | "refund";
  account: "operating" | "trust" | null; // null: the file doesn't say
  payer: string;
  email: string;
  reference: string; // memo / invoice number the client typed
  method: "card" | "ach";
};

export type LawPayParse = { rows: LawPayRow[]; skipped: { reason: string; count: number }[]; columns: Record<string, string | null>; hasAccountColumn: boolean };

const SKIP_STATUS = /declin|fail|void|cancel|reject|error|expired|reversed|chargeback/i;

export function parseLawPay(text: string): LawPayParse {
  const all = parseCsv(text);
  // The header is the first row with both a date and an amount column.
  const hi = all.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|total/i.test(c)));
  if (hi < 0) throw new Error("This doesn't look like a LawPay transactions file: no Date and Amount columns. In LawPay, open Reports → Transactions and export to CSV.");
  const header = all[hi].map((h) => h.toLowerCase().trim());
  const col = (...res: RegExp[]) => {
    for (const re of res) {
      const i = header.findIndex((h) => re.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    id: col(/^transaction id$/, /^(charge|payment|txn|transaction)[ _]?(id|#|number)$/, /^id$/, /reference (id|number)$/),
    date: col(/^(transaction |payment |created |posted )?date/, /date/),
    amount: col(/^(gross )?amount$/, /^amount/, /^total$/, /charge amount|payment amount/),
    fee: col(/^fees?$/, /processing fee|fee amount|fees/),
    status: col(/^status$/, /status/),
    type: col(/^(transaction )?type$/, /^kind$/),
    account: col(/deposit account|bank account|^account( name)?$|merchant account|account/),
    payer: col(/^(payer|client|customer|cardholder|name on card|account holder|payer name|client name|name)$/, /payer|cardholder|client|customer|name/),
    email: col(/e-?mail/),
    reference: col(/^(reference|memo|description|invoice|invoice number|note|notes|comment|comments)$/, /reference|memo|invoice|description|note|comment/),
    method: col(/^(payment )?method$/, /payment type|card type|tender|method/),
  };
  if (c.date < 0 || c.amount < 0) throw new Error("Couldn't find the Date and Amount columns in this file.");
  const skipped = new Map<string, number>();
  const skip = (why: string) => skipped.set(why, (skipped.get(why) ?? 0) + 1);
  const seen = new Map<string, number>();
  const rows: LawPayRow[] = [];
  for (const r of all.slice(hi + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const status = get(c.status);
    if (status && SKIP_STATUS.test(status)) {
      skip(`not completed (${status.toLowerCase()})`);
      continue;
    }
    const date = parseDate(get(c.date));
    const raw = parseMoney(get(c.amount));
    if (!date || raw === null || raw === 0) {
      skip("no date or amount");
      continue;
    }
    const typeText = `${get(c.type)} ${status}`.toLowerCase();
    const type: LawPayRow["type"] = raw < 0 || /refund|credit/.test(typeText) ? "refund" : "payment";
    const acct = get(c.account);
    const account = c.account < 0 ? null : /trust|iolta/i.test(acct) ? "trust" : "operating";
    const methodText = `${get(c.method)} ${get(c.type)}`.toLowerCase();
    const payer = get(c.payer).slice(0, 200);
    const amount = Math.round(Math.abs(raw) * 100) / 100;
    const base = get(c.id) || `${date}|${amount.toFixed(2)}|${payer.toLowerCase()}|${type}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({
      ref: `lawpay|${n > 1 ? `${base}|${n}` : base}`.slice(0, 300),
      date,
      amount,
      fee: Math.round(Math.abs(parseMoney(get(c.fee)) ?? 0) * 100) / 100,
      type,
      account,
      payer,
      email: get(c.email).slice(0, 200),
      reference: get(c.reference).slice(0, 300),
      method: /e-?check|ach|bank/.test(methodText) ? "ach" : "card",
    });
  }
  const names = Object.fromEntries(Object.entries(c).map(([k, i]) => [k, i >= 0 ? all[hi][i] : null]));
  return { rows, skipped: [...skipped].map(([reason, count]) => ({ reason, count })), columns: names, hasAccountColumn: c.account >= 0 };
}
