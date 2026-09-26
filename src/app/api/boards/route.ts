import { NextResponse } from "next/server";
import { listBoards, createBoard } from "@/lib/data/boards";
import { boardError as err } from "@/lib/data/boardsApi";

export const dynamic = "force-dynamic";



export async function GET() {
  try {
    return NextResponse.json({ boards: await listBoards() });
  } catch (e) {
    return err("GET /api/boards", e);
  }
}

export async function POST(request: Request) {
  try {
    const { name } = (await request.json().catch(() => ({}))) as { name?: string };
    return NextResponse.json({ board: await createBoard(name) }, { status: 201 });
  } catch (e) {
    return err("POST /api/boards", e);
  }
}
