import "server-only";
import { cleanChecklist } from "@/lib/checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { boardInOrg } from "@/lib/data/boards";
import { columnInOrg } from "@/lib/data/boardColumns";
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
  created_by?: string | null;
  updated_by?: string | null;
  column_id?: string | null;
  position?: number | null;
  checklist?: unknown;
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
    createdBy: row.created_by ?? null,
    columnId: row.column_id ?? null,
    position: typeof row.position === "number" ? row.position : null,
    checklist: cleanChecklist(row.checklist),
    updatedBy: row.updated_by ?? row.created_by ?? null,
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
    // Only sent when the card has been arranged by hand.
    ...(typeof task.position === "number" && Number.isFinite(task.position) ? { position: task.position } : {}),
    // Only sent when the task's checklist was changed (null removes it).
    ...(task.checklist !== undefined ? { checklist: cleanChecklist(task.checklist) } : {}),
  };
}

// Adds column_id only when the task names a custom column in this workspace.
async function withColumn<T extends Record<string, unknown>>(orgId: string, task: BoardTask, fields: T): Promise<T> {
  if (task.columnId === undefined) return fields;
  return { ...fields, column_id: await columnInOrg(orgId, task.columnId) };
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
    .insert(await withColumn(orgId, task, { id: task.id, org_id: orgId, created_by: userId, ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId) }))
    .select("*")
    .single()
    .then(async (r) =>
      // Before 0010 is run there's no column_id; save without it.
      r.error && /column_id/.test(r.error.message ?? "")
        ? supabase.from("tasks").insert({ id: task.id, org_id: orgId, created_by: userId, ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId) }).select("*").single()
        : r
    );

  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function updateTaskRow(id: string, task: BoardTask, userId: string | null = null): Promise<BoardTask> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const base = await withColumn(orgId, task, { ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId), updated_at: new Date().toISOString() });
  const run = (fields: Record<string, unknown>) =>
    supabase.from("tasks").update(fields).eq("id", id).eq("org_id", orgId).select("*").single();

  // Columns added by later migrations; if one isn't there yet, save without it.
  let fields: Record<string, unknown> = userId ? { ...base, updated_by: userId } : { ...base };
  let { data, error } = await run(fields);
  for (const col of ["updated_by", "column_id", "position", "checklist"]) {
    if (!error || !new RegExp(col).test(error.message ?? "") || !(col in fields)) continue;
    const { [col]: _drop, ...rest } = fields;
    void _drop;
    fields = rest;
    ({ data, error } = await run(fields));
  }

  if (error) throw error;
  return toTask(data as TaskRow);
}

export async function deleteTaskRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { error } = await supabase.from("tasks").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
