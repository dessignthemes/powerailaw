import { NextResponse } from "next/server";
import { getInvoice, deleteInvoice, invoiceForPrint, InvoiceError } from "@/lib/data/invoices";
import { who, fail, isId } from "@/lib/data/invoiceApi";

export const dynamic = "force-dynamic";

// GET → the invoice with its lines and payments. DELETE → the invoice and its payment entries.

// GET ?print=1 → also the firm, client and matter, for the printable invoice.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await who();
    const { id } = await params;
    if (!isId(id)) throw new InvoiceError("That invoice wasn't found.", 404);
    if (new URL(request.url).searchParams.get("print") === "1") return NextResponse.json(await invoiceForPrint(orgId, id));
    return NextResponse.json({ invoice: await getInvoice(orgId, id) });
  } catch (e) {
    return fail("GET /api/invoices/[id]", e);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await who();
    const { id } = await params;
    if (!isId(id)) throw new InvoiceError("That invoice wasn't found.", 404);
    await deleteInvoice(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("DELETE /api/invoices/[id]", e);
  }
}
