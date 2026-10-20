import { NextResponse } from "next/server";
import { listInvoices, createInvoice } from "@/lib/data/invoices";
import { who, fail, isId } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// GET [?matterId=] → invoices (newest first). POST { matterId, issueDate, dueDate, notes, lines } → new invoice.
export async function GET(request: Request) {
  try {
    const { orgId } = await who();
    const m = new URL(request.url).searchParams.get("matterId");
    return NextResponse.json({ invoices: await listInvoices(orgId, isId(m) ? m : null) });
  } catch (e) {
    return fail("GET /api/invoices", e);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await who();
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ invoice: await createInvoice(orgId, userId, body) }, { status: 201 });
  } catch (e) {
    return fail("POST /api/invoices", e);
  }
}
