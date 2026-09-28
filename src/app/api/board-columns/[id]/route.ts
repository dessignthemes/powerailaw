import { NextResponse } from "next/server";
import { updateColumn, deleteColumn } from "@/lib/data/boardColumns";
import { boardError } from "@/lib/data/boardsApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { title?: string; color?: string };
    return NextResponse.json({ column: await updateColumn(id, body) });
  } catch (e) {
    return boardError("PATCH /api/board-columns/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    await deleteColumn(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return boardError("DELETE /api/board-columns/[id]", e);
  }
}
