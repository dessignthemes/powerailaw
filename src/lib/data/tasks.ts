import "server-only";
import { cleanChecklist } from "@/lib/checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { boardInOrg } from "@/lib/data/boards";
import { columnInOrg } from "@/lib/data/boardColumns";
import type { WaitingOn } from "@/lib/tasks/waitingOn";
import { notifyAssigned } from "@/lib/data/notifications";
import { getSessionUser } from "@/lib/auth";
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
  offered_to?: string[] | null;
  instructions?: string | null;
  assigned_by?: string | null;
  is_private?: boolean | null;
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
    waitingOn: row.waiting_on?.trim() ? (row.waiting_on.trim().slice(0, 60) as WaitingOn) : null,
    offeredTo: Array.isArray(row.offered_to) ? row.offered_to : [],
    instructions: row.instructions ?? "",
    assignedBy: row.assigned_by ?? null,
    isPrivate: !!row.is_private,
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
    // Offered to several people / the assigner's instructions / who assigned it (only when sent).
    ...(task.offeredTo !== undefined ? { offered_to: cleanEmails(task.offeredTo) } : {}),
    ...(task.instructions !== undefined ? { instructions: String(task.instructions ?? "").slice(0, 5000) } : {}),
    ...(task.assignedBy !== undefined ? { assigned_by: task.assignedBy ? String(task.assignedBy).slice(0, 200).toLowerCase() : null } : {}),
    // Private: only the creator and the assignee see it (only sent when set).
    ...(task.isPrivate !== undefined ? { is_private: !!task.isPrivate } : {}),
    // Who the task is waiting on (only sent when the browser set it; null = nobody).
    ...(task.waitingOn !== undefined ? { waiting_on: typeof task.waitingOn === "string" && task.waitingOn.trim() ? task.waitingOn.replace(/\s+/g, " ").trim().slice(0, 60) : null } : {}),
  };
}

const cleanEmails = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[^\s@]+@[^\s@]+$/.test(x.trim())).map((x) => x.trim().toLowerCase()))].slice(0, 20)
    : [];

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

// A private task is visible only to whoever created it, assigned it, or has it
// (assigned or offered); everyone else in the firm never gets it from the server.
export function canSeeTask(row: { is_private?: boolean | null; created_by?: string | null; assignee?: string | null; assigned_by?: string | null; offered_to?: string[] | null }, me: { id: string; email: string | null } | null) {
  if (!row.is_private) return true;
  if (!me) return false;
  const email = (me.email ?? "").toLowerCase();
  return row.created_by === me.id || (!!email && ((row.assignee ?? "").toLowerCase() === email || (row.assigned_by ?? "").toLowerCase() === email || (row.offered_to ?? []).some((e) => e.toLowerCase() === email)));
}

// Private needs migration 0054; never drop it silently (the task would quietly become visible to all).
export class TaskSetupError extends Error {
  status = 503;
  constructor() {
    super("Private tasks need a one-time database update: run supabase/migrations/0054_private_tasks.sql in the Supabase SQL editor, then try again.");
  }
}

export class TaskAccessError extends Error {
  status = 404;
  constructor() {
    super("Task not found.");
  }
}

export async function listTasks(): Promise<BoardTask[]> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();
  const me = await getSessionUser();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as TaskRow[]).filter((r) => canSeeTask(r, me)).map(toTask);
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
      if (!r.error || !/column_id|waiting_on|offered_to|instructions|assigned_by|is_private/.test(r.error.message ?? "")) return r;
      if (/is_private/.test(r.error.message ?? "") && (row as { is_private?: boolean }).is_private === true) throw new TaskSetupError();
      const { waiting_on: _w, offered_to: _o, instructions: _i, assigned_by: _a, is_private: _p, ...plain } = row as typeof row & {
        waiting_on?: unknown;
        offered_to?: unknown;
        instructions?: unknown;
        assigned_by?: unknown;
        is_private?: unknown;
      };
      void _p;
      void _w;
      void _o;
      void _i;
      void _a;
      return supabase.from("tasks").insert(plain).select("*").single();
    });

  if (error) throw error;
  const created = toTask(data as TaskRow);
  await notifyAssigned({ orgId, actorId: userId, kind: "task_assigned", refId: created.id, boardId: created.boardId, title: created.title, to: created.assignee });
  // Offered to several people: each gets an alert to accept it.
  if (!created.assignee) {
    for (const email of created.offeredTo ?? []) {
      await notifyAssigned({ orgId, actorId: userId, kind: "task_offered", refId: created.id, boardId: created.boardId, title: created.title, to: email });
    }
  }
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
  const { data: before } = await supabase.from("tasks").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (before && !canSeeTask(before as TaskRow, await getSessionUser())) throw new TaskAccessError();

  // Columns added by later migrations; if one isn't there yet, save without it.
  let fields: Record<string, unknown> = userId ? { ...base, updated_by: userId } : { ...base };
  let { data, error } = await run(fields);
  for (const col of ["updated_by", "column_id", "position", "checklist", "waiting_on", "offered_to", "instructions", "assigned_by", "is_private"]) {
    if (!error || !new RegExp(col).test(error.message ?? "") || !(col in fields)) continue;
    if (col === "is_private" && fields.is_private === true) throw new TaskSetupError();
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
  // Newly offered people (an existing task offered to several) get an alert to accept it.
  if (!updated.assignee) {
    const had = new Set(((before as { offered_to?: string[] | null } | null)?.offered_to ?? []).map((e) => e.toLowerCase()));
    for (const email of updated.offeredTo ?? []) {
      if (had.has(email.toLowerCase())) continue;
      await notifyAssigned({ orgId, actorId: userId, kind: "task_offered", refId: updated.id, boardId: updated.boardId, title: updated.title, to: email });
    }
  }
  return updated;
}

export async function deleteTaskRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  // Someone else's private task can't be deleted (it isn't visible to you).
  const me = await getSessionUser();
  const { data: rows } = await supabase.from("tasks").select("id, is_private, created_by, assignee, assigned_by, offered_to").eq("org_id", orgId).in("id", ids);
  const allowed = ((rows ?? []) as TaskRow[]).filter((r) => canSeeTask(r, me)).map((r) => r.id);
  if (!allowed.length) return;
  const { error } = await supabase.from("tasks").delete().eq("org_id", orgId).in("id", allowed);
  if (error) throw error;
}

// ── Accepting a task that was offered to several people ───────────────────────

export class TaskAcceptError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

// The first person to accept becomes the assignee; it leaves everyone else's list.
export async function acceptTask(id: string, userId: string): Promise<BoardTask> {
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const { data: me } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = ((me?.email as string | undefined) ?? "").toLowerCase();
  if (!email) throw new TaskAcceptError(400, "Your account has no email address.");
  // One step, so two people accepting at the same moment can't both get it.
  const { data, error } = await db
    .from("tasks")
    .update({ assignee: email, offered_to: [], updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("assignee", null)
    .contains("offered_to", [email])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: t } = await db.from("tasks").select("assignee, offered_to").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (!t) throw new TaskAcceptError(404, "Task not found.");
    if (t.assignee) throw new TaskAcceptError(409, t.assignee === email ? "You already have this task." : `${t.assignee} already accepted this task.`);
    throw new TaskAcceptError(409, "This task isn't offered to you.");
  }
  const task = toTask(data as TaskRow);
  if (task.assignedBy) {
    await notifyAssigned({ orgId, actorId: userId, kind: "task_accepted", refId: task.id, boardId: task.boardId, title: task.title, to: task.assignedBy });
  }
  return task;
}
