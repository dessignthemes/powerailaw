import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { acceptTask, TaskAcceptError } from "@/lib/data/tasks";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

// POST → the signed-in person accepts a task offered to them (first one wins).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    return NextResponse.json({ task: await acceptTask(id, userId) });
  } catch (e) {
    if (e instanceof TaskAcceptError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/tasks/[id]/accept failed:", e);
    return NextResponse.json({ error: "The task couldn't be accepted. Please try again." }, { status: 500 });
  }
}
