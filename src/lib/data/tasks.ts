import "server-only";
import { cleanChecklist } from "@/lib/checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { boardInOrg } from "@/lib/data/boards";
import { columnInOrg } from "@/lib/data/boardColumns";
import { WAITING_ON, type WaitingOn } from "@/lib/tasks/waitingOn";
import { notifyAssigned } from "@/lib/data/notifications";
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
  matter_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  column_id?: string | null;
  waiting_on?: string | null;
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
    matterId: row.matter_id ?? null,
    createdBy: row.created_by ?? null,
    columnId: row.column_id ?? null,
    waitingOn: (WAITING_ON as readonly string[]).includes(row.waiting_on ?? "") ? (row.waiting_on as WaitingOn) : null,
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
    // Who the task is waiting on (only sent when the browser set it; null = nobody).
    ...(task.waitingOn !== undefined ? { waiting_on: (WAITING_ON as readonly string[]).includes(task.waitingOn ?? "") ? task.waitingOn : null } : {}),
  };
}

// A matter id from the browser, kept only when that matter is in this workspace.
async function matterInOrg(orgId: string, matterId: string | null | undefined): Promise<string | null> {
  if (!matterId) return null;
  const { data } = await createAdminClient().from("matters").select("id").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  return data ? (data.id as string) : null;
}

// Adds matter_id only when the browser sent one (undefined = leave as is).
async function withMatter<T extends Record<string, unknown>>(orgId: string, task: BoardTask, fields: T): Promise<T> {
  if (task.matterId === undefined) return fields;
  return { ...fields, matter_id: await matterInOrg(orgId, task.matterId) };
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

  const row = await withMatter(orgId, task, { id: task.id, org_id: orgId, created_by: userId, ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId) });
  const { data, error } = await supabase
    .from("tasks")
    .insert(await withColumn(orgId, task, row))
    .select("*")
    .single()
    .then(async (r) => {
      // Before 0010 / 0031 are run there's no column_id / waiting_on; save without them.
      if (!r.error || !/column_id|waiting_on/.test(r.error.message ?? "")) return r;
      const { waiting_on: _w, ...plain } = row as typeof row & { waiting_on?: unknown };
      void _w;
      return supabase.from("tasks").insert(plain).select("*").single();
    });

  if (error) throw error;
  const created = toTask(data as TaskRow);
  await notifyAssigned({ orgId, actorId: userId, kind: "task_assigned", refId: created.id, boardId: created.boardId, title: created.title, to: created.assignee });
  return created;
}

export async function updateTaskRow(id: string, task: BoardTask, userId: string | null = null): Promise<BoardTask> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const base = await withColumn(
    orgId,
    task,
    await withMatter(orgId, task, { ...toColumns(task), board_id: await boardInOrg(orgId, task.boardId), updated_at: new Date().toISOString() })
  );
  const run = (fields: Record<string, unknown>) =>
    supabase.from("tasks").update(fields).eq("id", id).eq("org_id", orgId).select("*").single();
  // Who it was assigned to before (to alert only a newly assigned person).
  const { data: before } = await supabase.from("tasks").select("assignee").eq("id", id).eq("org_id", orgId).maybeSingle();

  // Columns added by later migrations; if one isn't there yet, save without it.
  let fields: Record<string, unknown> = userId ? { ...base, updated_by: userId } : { ...base };
  let { data, error } = await run(fields);
  for (const col of ["updated_by", "column_id", "position", "checklist", "waiting_on"]) {
    if (!error || !new RegExp(col).test(error.message ?? "") || !(col in fields)) continue;
    const { [col]: _drop, ...rest } = fields;
    void _drop;
    fields = rest;
    ({ data, error } = await run(fields));
  }

  if (error) throw error;
  const updated = toTask(data as TaskRow);
  await notifyAssigned({
    orgId,
    actorId: userId,
    kind: "task_assigned",
    refId: updated.id,
    boardId: updated.boardId,
    title: updated.title,
    to: updated.assignee,
    before: (before as { assignee?: string | null } | null)?.assignee ?? null,
  });
  return updated;
}

export async function deleteTaskRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { error } = await supabase.from("tasks").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
