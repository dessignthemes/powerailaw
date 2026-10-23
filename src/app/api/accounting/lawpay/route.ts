import { NextResponse } from "next/server";
import { requireAccountingOwner } from "@/lib/data/accounting";
import { requireUserOrg } from "@/lib/data/documents";
import { previewLawPay, importLawPay } from "@/lib/data/lawpayImport";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { csv, account: "operating" | "trust", preview?: boolean } — a LawPay
// transactions report: preview what will happen, then import it.
export async function POST(request: Request) {
  try {
    await requireAccountingOwner();
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { csv?: unknown; account?: unknown; preview?: unknown };
    const csv = typeof b.csv === "string" ? b.csv.slice(0, 5_000_000) : "";
    if (!csv.trim()) return NextResponse.json({ error: "Choose the LawPay CSV file first." }, { status: 400 });
    const account = b.account === "trust" ? "trust" : "operating";
    try {
      if (b.preview) return NextResponse.json(await previewLawPay(orgId, csv, account));
      return NextResponse.json(await importLawPay(orgId, user.id, csv, account));
    } catch (e) {
      if (e instanceof Error && /LawPay|Date and Amount/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  } catch (error) {
    return acctFail("POST /api/accounting/lawpay", error);
  }
}
