import { NextResponse } from "next/server";
import { updateTaskRow } from "@/lib/data/tasks";
import type { BoardTask } from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = (await request.json()) as BoardTask;
    const updated = await updateTaskRow(id, task);
    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("PATCH /api/tasks/[id] failed:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
