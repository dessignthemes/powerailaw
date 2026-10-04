import { NextResponse } from "next/server";
import { z } from "zod";
import { importRows, AcctError } from "@/lib/data/accounting";
import { categorize } from "@/lib/accounting/ai";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  account: z.enum(["operating", "trust", "credit_card", "other"]),
  rows: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().max(500), amount: z.number().positive().max(999_999_999), kind: z.enum(["income", "expense"]) }))
    .min(1)
    .max(2000),
});

// POST { account, rows } — the AI suggests a category for each bank line,
// then all lines are saved for review (duplicates are skipped).
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AcctError(400, "The file couldn't be read. Check that it has date, description and amount columns.");
    const { rows, account } = parsed.data;
    const isTrust = account === "trust";
    const suggestions = isTrust ? new Map() : await categorize(rows.map((r, i) => ({ i, ...r })));
    const result = await importRows(
      rows.map((r, i) => {
        const s = suggestions.get(i);
        return {
          ...r,
          category: isTrust ? "trust_activity" : s?.category ?? "uncategorized",
          counterparty: s?.counterparty ?? "",
          confidence: isTrust ? 1 : s?.confidence ?? 0,
          reason: isTrust ? "Trust account activity" : s?.reason ?? (suggestions.size ? "" : "AI not available; please categorize"),
        };
      }),
      account
    );
    return NextResponse.json({ ...result, categorized: suggestions.size });
  } catch (error) {
    return acctFail("POST /api/accounting/import", error);
  }
}
