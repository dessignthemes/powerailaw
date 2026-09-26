import { NextResponse } from "next/server";
import { renameBoard, deleteBoard } from "@/lib/data/boards";
import { boardError } from "@/lib/data/boardsApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const { name } = (await request.json().catch(() => ({}))) as { name?: string };
    return NextResponse.json({ board: await renameBoard(id, name) });
  } catch (e) {
    return boardError("PATCH /api/boards/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    await deleteBoard(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return boardError("DELETE /api/boards/[id]", e);
  }
}
