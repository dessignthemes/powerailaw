import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { boardInOrg } from "@/lib/data/boards";
import type { BoardTask, TaskComment } from "@/components/NewTaskModal";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: BoardTask["status"];
  priority: BoardTask["priority"];
  assignee: string | null;
  due_date: string | null;
  comments: TaskComment[] | null;
  board_id?: string | null;
  created_at: string;
  updated_at: string;
};

function toTask(row: TaskRow): BoardTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    dueDate: row.due_date,
    comments: Array.isArray(row.comments) ? row.comments : [],
    boardId: row.board_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toColumns(task: BoardTask) {
  return {
    title: task.title.trim(),
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    due_date: task.dueDate || null,
    comments: task.comments ?? [],
  };
}

export async function listTasks(): Promise<BoardTask[]> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as TaskRow[]).map(toTask);
}

export async function createTaskRow(task: BoardTask, userId: string | null): Promise<BoardTask> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { data, error } = await supabase
    .from("tasks")
    .insert({ id: task.id, org_id: orgId, created_by: userId, ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId) })
    .select("*")
    .single();

  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function updateTaskRow(id: string, task: BoardTask): Promise<BoardTask> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { data, error } = await supabase
    .from("tasks")
    .update({ ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();

  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function deleteTaskRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { error } = await supabase.from("tasks").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
