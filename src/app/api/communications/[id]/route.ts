import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { markCalledBack, deleteComm, CommError } from "@/lib/data/communications";

export const dynamic = "force-dynamic";
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// PATCH { calledBack: boolean } → tick off a call back (and its task). DELETE → remove the log.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    if (!isId(id)) throw new CommError("Not found.", 404);
    const b = (await request.json().catch(() => ({}))) as { calledBack?: unknown };
    await markCalledBack(orgId, id, b.calledBack !== false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CommError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/communications/[id] failed:", e);
    return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    if (!isId(id)) throw new CommError("Not found.", 404);
    await deleteComm(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CommError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/communications/[id] failed:", e);
    return NextResponse.json({ error: "Couldn't delete." }, { status: 500 });
  }
}
