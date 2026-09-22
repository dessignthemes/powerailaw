import { NextResponse } from "next/server";
import { listTasks, createTaskRow, deleteTaskRows } from "@/lib/data/tasks";
import { getSessionUserId } from "@/lib/auth";
import type { BoardTask } from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await listTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("GET /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const task = (await request.json()) as BoardTask;
    if (!task.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const userId = await getSessionUserId();
    const created = await createTaskRow(task, userId);
    return NextResponse.json({ task: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = (await request.json()) as { ids: string[] };
    await deleteTaskRows(ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to delete tasks" }, { status: 500 });
  }
}
