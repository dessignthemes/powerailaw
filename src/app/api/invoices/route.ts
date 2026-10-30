import { NextResponse } from "next/server";
import { listInvoices, createInvoice, roleOf, outstandingByClient } from "@/lib/data/invoices";
import { who, fail, isId } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// GET [?matterId=] → { invoices (newest first), canApprove, balances (who owes what) }.
// POST { matterId, issueDate, dueDate, notes, lines, stage: "draft" | "pending" | "issue" } → new invoice.
export async function GET(request: Request) {
  try {
    const { orgId, userId } = await who();
    const m = new URL(request.url).searchParams.get("matterId");
    const [invoices, role, balances] = await Promise.all([listInvoices(orgId, isId(m) ? m : null), roleOf(orgId, userId), isId(m) ? Promise.resolve([]) : outstandingByClient(orgId)]);
    return NextResponse.json({ invoices, canApprove: role.canApprove, balances });
  } catch (e) {
    return fail("GET /api/invoices", e);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await who();
    const body = await request.json().catch(() => ({}));
    const { canApprove } = await roleOf(orgId, userId);
    return NextResponse.json({ invoice: await createInvoice(orgId, userId, body, canApprove) }, { status: 201 });
  } catch (e) {
    return fail("POST /api/invoices", e);
  }
}
