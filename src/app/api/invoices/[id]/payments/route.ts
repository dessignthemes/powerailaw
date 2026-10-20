import { NextResponse } from "next/server";
import { recordPayment, InvoiceError } from "@/lib/data/invoices";
import { who, fail, isId } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// POST { date, amount, method } → records money received; goes into the operating ledger.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId, userId } = await who();
    const { id } = await params;
    if (!isId(id)) throw new InvoiceError("That invoice wasn't found.", 404);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ invoice: await recordPayment(orgId, userId, id, body) });
  } catch (e) {
    return fail("POST /api/invoices/[id]/payments", e);
  }
}
