import { NextResponse } from "next/server";
import { setBoardFilters, BoardError } from "@/lib/data/boards";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

// PUT { board: "<board id>" | "general" | "all", filters: [{ kind, value }] } → that board's quick filters.
export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { board?: unknown; filters?: unknown };
    return NextResponse.json({ boardFilters: await setBoardFilters(body.board, body.filters) });
  } catch (e) {
    if (e instanceof BoardError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PUT /api/boards/filters failed:", e);
    return NextResponse.json({ error: "The filters couldn't be saved." }, { status: 500 });
  }
}
