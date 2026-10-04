// Builds the accountant package (.zip): an Excel workbook plus every receipt.

import { zip, strToU8 } from "fflate";
import { buildXlsx, type Sheet } from "@/lib/accounting/xlsx";
import { ACCOUNT_LABEL, catLabel, readiness, summarize, type Txn } from "@/lib/accounting/core";

export type TimeRow = { matterId: string | null; billableMinutes: number; otherMinutes: number; valueCents: number };
type Names = { client: (id: string | null) => string; matter: (id: string | null) => string };

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60) || "receipt";

export async function buildPackage(opts: {
  firm: string;
  periodLabel: string;
  from: string;
  to: string;
  txns: Txn[];
  time: TimeRow[];
  names: Names;
  onProgress?: (msg: string) => void;
}): Promise<Blob> {
  const { txns, time, names } = opts;
  const live = txns.filter((t) => t.status !== "excluded").sort((a, b) => a.date.localeCompare(b.date));
  const s = summarize(live);
  const r = readiness(txns);

  // Receipts: named by date, vendor and amount so they match the sheet.
  const files: Record<string, Uint8Array> = {};
  const receiptName = new Map<string, string>();
  const withReceipts = live.filter((t) => t.receiptPath);
  if (withReceipts.length) {
    opts.onProgress?.(`Collecting ${withReceipts.length} receipt(s)…`);
    const res = await fetch("/api/accounting/receipt/urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: withReceipts.map((t) => t.receiptPath) }),
    });
    const urls: Record<string, string> = res.ok ? (await res.json()).urls : {};
    let n = 0;
    for (const t of withReceipts) {
      const url = urls[t.receiptPath!];
      if (!url) continue;
      try {
        const b = await fetch(url);
        if (!b.ok) continue;
        const ext = t.receiptPath!.split(".").pop();
        const name = `Receipts/${t.date} ${safe(t.counterparty || t.description)} ${t.amount.toFixed(2)}.${ext}`;
        const unique = files[name] ? name.replace(/\.(\w+)$/, ` (${++n}).$1`) : name;
        files[unique] = new Uint8Array(await b.arrayBuffer());
        receiptName.set(t.id, unique.replace("Receipts/", ""));
      } catch {
        // skipped receipts are listed as missing in the sheet
      }
    }
  }

  opts.onProgress?.("Building the workbook…");
  const sheets: Sheet[] = [
    {
      name: "Summary",
      widths: [42, 22],
      money: [1],
      rows: [
        ["Accountant package", opts.firm || "Law firm"],
        ["Period", opts.periodLabel],
        ["Dates", `${opts.from} to ${opts.to}`],
        ["Prepared", new Date().toISOString().slice(0, 10)],
        ["", ""],
        ["Income (excludes trust)", s.income],
        ["Expenses", s.expenses],
        ["Net profit", s.net],
        ["Estimated deductible expenses*", s.deductible],
        ["Trust deposits (not income)", s.trustIn],
        ["Trust disbursements", s.trustOut],
        ["Billable time recorded (value)", Math.round(time.reduce((a, t) => a + t.valueCents, 0)) / 100],
        ["", ""],
        ["Readiness", `${r.score}%`],
        ...r.checks.map((c) => [c.label, c.total ? `${c.done} of ${c.total}` : "n/a"] as (string | number)[]),
        ["", ""],
        ["* Meals at 50%, reimbursable client costs excluded. Estimate only; your accountant decides the final treatment.", ""],
        ["Prepared with LawPower AI. Not tax or accounting advice.", ""],
      ],
    },
    {
      name: "Profit & Loss",
      widths: [36, 34, 10, 16],
      money: [3],
      rows: [
        ["Category", "IRS Schedule C (closest line)", "Count", "Total"],
        ...s.byCategory.filter((c) => c.pl === "income").map((c) => [c.label, c.schedC, c.count, c.total]),
        ["Total income", "", "", s.income],
        ["", "", "", ""],
        ...s.byCategory.filter((c) => c.pl === "expense").map((c) => [c.label, c.schedC, c.count, c.total]),
        ["Total expenses", "", "", s.expenses],
        ["", "", "", ""],
        ["Net profit", "", "", s.net],
      ],
    },
    {
      name: "By month",
      widths: [12, 16, 16, 16],
      money: [1, 2, 3],
      rows: [["Month", "Income", "Expenses", "Net"], ...s.byMonth.map((m) => [m.month, m.income, m.expenses, Math.round((m.income - m.expenses) * 100) / 100])],
    },
    {
      name: "Transactions",
      widths: [11, 10, 30, 40, 28, 16, 18, 24, 24, 12, 13, 34, 30],
      money: [5],
      rows: [
        ["Date", "Type", "Payee / payer", "Description", "Category", "Amount", "Account", "Client", "Matter", "Reimbursable", "Status", "Receipt file", "Notes"],
        ...live.map((t) => [
          t.date,
          t.kind,
          t.counterparty,
          t.description,
          catLabel(t.category),
          t.kind === "expense" ? -t.amount : t.amount,
          ACCOUNT_LABEL[t.account],
          t.clientId ? names.client(t.clientId) : "",
          t.matterId ? names.matter(t.matterId) : "",
          t.reimbursable ? "Yes" : "",
          t.status === "ready" ? "Reviewed" : "Not reviewed",
          receiptName.get(t.id) ?? (t.receiptPath ? "(could not download)" : ""),
          t.notes,
        ]),
      ],
    },
    {
      name: "Income by client",
      widths: [36, 16],
      money: [1],
      rows: [["Client", "Total received"], ...s.incomeByClient.map((c) => [c.clientId ? names.client(c.clientId) : "No client linked", c.total])],
    },
    {
      name: "Client costs",
      widths: [32, 32, 16, 16],
      money: [2, 3],
      rows: [
        ["Client", "Matter", "Advanced", "Reimbursable"],
        ...s.clientCosts.map((c) => [c.clientId ? names.client(c.clientId) : "", c.matterId ? names.matter(c.matterId) : "Not linked", c.total, c.reimbursable]),
      ],
    },
    {
      name: "Trust (IOLTA)",
      widths: [11, 10, 30, 40, 16, 24, 24],
      money: [4],
      rows: [
        ["Date", "Type", "Payee / payer", "Description", "Amount", "Client", "Matter"],
        ...live.filter((t) => t.account === "trust").map((t) => [t.date, t.kind === "income" ? "Deposit" : "Disbursement", t.counterparty, t.description, t.kind === "expense" ? -t.amount : t.amount, t.clientId ? names.client(t.clientId) : "", t.matterId ? names.matter(t.matterId) : ""]),
      ],
    },
    {
      name: "Billable time",
      widths: [40, 16, 18, 18],
      money: [3],
      rows: [
        ["Matter", "Billable hours", "Non-billable hours", "Value at rate"],
        ...time.map((t) => [t.matterId ? names.matter(t.matterId) : "No matter", Math.round(t.billableMinutes / 6) / 10, Math.round(t.otherMinutes / 6) / 10, t.valueCents / 100]),
      ],
    },
    {
      name: "Questions",
      widths: [110],
      rows: [["Questions and notes for your accountant"], ...(r.questions.length ? r.questions : ["No open questions were found."]).map((q) => [q])],
    },
  ];

  const book = buildXlsx(sheets);
  const xlsx = await new Promise<Uint8Array>((res, rej) => zip(book, { level: 6 }, (e, d) => (e ? rej(e) : res(d))));
  const base = `${safe(opts.firm || "Law firm")} - Accountant package - ${opts.periodLabel}`;
  files[`${base}.xlsx`] = xlsx;
  files["README.txt"] = strToU8(
    [
      `Accountant package: ${opts.periodLabel} (${opts.from} to ${opts.to})`,
      ``,
      `Open the .xlsx workbook first. Sheets: Summary, Profit & Loss, By month, Transactions,`,
      `Income by client, Client costs, Trust (IOLTA), Billable time, Questions.`,
      `Receipts are in the Receipts folder, named "date vendor amount" to match the Transactions sheet.`,
      ``,
      `Trust (IOLTA) money is listed separately and is not counted as income.`,
      `Prepared with LawPower AI. Categories are suggestions reviewed by the firm; this is not tax advice.`,
    ].join("\r\n")
  );
  opts.onProgress?.("Compressing…");
  const out = await new Promise<Uint8Array>((res, rej) => zip(files, { level: 0 }, (e, d) => (e ? rej(e) : res(d))));
  return new Blob([out as BlobPart], { type: "application/zip" });
}
