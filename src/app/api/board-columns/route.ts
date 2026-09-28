import { NextResponse } from "next/server";
import { listColumns, saveColumn } from "@/lib/data/boardColumns";
import { boardError } from "@/lib/data/boardsApi";

export const dynamic = "force-dynamic";

// GET /api/board-columns?board=general|<boardId>
export async function GET(request: Request) {
  try {
    const board = new URL(request.url).searchParams.get("board") ?? "general";
    return NextResponse.json({ columns: await listColumns(board) });
  } catch (e) {
    return boardError("GET /api/board-columns", e);
  }
}

// POST { board, title, color, status? } — status saves a standard column's name/color
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { board?: string; title?: string; color?: string; status?: string };
    return NextResponse.json({ column: await saveColumn(body) }, { status: 201 });
  } catch (e) {
    return boardError("POST /api/board-columns", e);
  }
}
