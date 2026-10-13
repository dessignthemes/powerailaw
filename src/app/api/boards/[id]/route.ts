import { NextResponse } from "next/server";
import { renameBoard, deleteBoard, renameGeneral, moveGeneralTasks } from "@/lib/data/boards";
import { boardError } from "@/lib/data/boardsApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const { name } = (await request.json().catch(() => ({}))) as { name?: string };
    // "general" = the built-in board for tasks not on a sub board.
    if (id === "general") return NextResponse.json({ board: { id: "general", name: await renameGeneral(name) } });
    return NextResponse.json({ board: await renameBoard(id, name) });
  } catch (e) {
    return boardError("PATCH /api/boards/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    if (id === "general") return NextResponse.json({ error: "Move its tasks to another board instead." }, { status: 400 });
    await deleteBoard(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return boardError("DELETE /api/boards/[id]", e);
  }
}

// POST /api/boards/general { action: "move", toBoardId } moves every task on General to another board.
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; toBoardId?: unknown };
    if (id !== "general" || body.action !== "move") return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
    return NextResponse.json({ moved: await moveGeneralTasks(body.toBoardId) });
  } catch (e) {
    return boardError("POST /api/boards/[id]", e);
  }
}
