import { NextResponse } from "next/server";
import { draftForMatter, InvoiceError } from "@/lib/data/invoices";
import { who, fail, isId } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// GET ?matterId= → what to bill: the flat fee (once) or billable time not yet billed.
export async function GET(request: Request) {
  try {
    const { orgId } = await who();
    const m = new URL(request.url).searchParams.get("matterId");
    if (!isId(m)) throw new InvoiceError("Pick the matter to bill.");
    return NextResponse.json(await draftForMatter(orgId, m));
  } catch (e) {
    return fail("GET /api/invoices/draft", e);
  }
}
