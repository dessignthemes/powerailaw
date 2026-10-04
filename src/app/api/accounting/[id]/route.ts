import { NextResponse } from "next/server";
import { updateTxn, deleteTxn } from "@/lib/data/accounting";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ txn: await updateTxn(id, await request.json()) });
  } catch (error) {
    return acctFail("PATCH /api/accounting/[id]", error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTxn(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return acctFail("DELETE /api/accounting/[id]", error);
  }
}
