import { NextResponse } from "next/server";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/data/timeEntries";
import { timeError } from "@/lib/data/timeApi";

export const dynamic = "force-dynamic";

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTimeEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return timeError("DELETE /api/time-entries/[id]", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ entry: await updateTimeEntry(id, body) });
  } catch (e) {
    return timeError("PATCH /api/time-entries/[id]", e);
  }
}
