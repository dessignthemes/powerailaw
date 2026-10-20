import { NextResponse } from "next/server";
import { trustBalances } from "@/lib/data/invoices";
import { who, fail } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// GET → each matter's money held in trust: deposits, paid out / moved to operating, balance.
export async function GET() {
  try {
    const { orgId } = await who();
    return NextResponse.json({ balances: await trustBalances(orgId) });
  } catch (e) {
    return fail("GET /api/accounting/trust", e);
  }
}
