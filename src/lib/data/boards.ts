import "server-only";
import { cleanFilters, type CustomFilter } from "@/lib/tasks/customFilters";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { getSessionUserId } from "@/lib/auth";

export type TaskBoardRow = { id: string; name: string; position: number };

export class BoardError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

function cleanName(name: unknown) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!n) throw new BoardError(400, "Give the board a name.");
  return n;
}

export async function listBoards(): Promise<TaskBoardRow[]> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient()
    .from("task_boards")
    .select("id, name, position")
    .eq("org_id", orgId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as TaskBoardRow[];
}

export async function createBoard(name: unknown): Promise<TaskBoardRow> {
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const { count } = await db.from("task_boards").select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) >= 50) throw new BoardError(400, "You can have up to 50 sub boards.");
  const { data, error } = await db
    .from("task_boards")
    .insert({ org_id: orgId, name: cleanName(name), position: count ?? 0, created_by: await getSessionUserId() })
    .select("id, name, position")
    .single();
  if (error) throw error;
  return data as TaskBoardRow;
}

export async function renameBoard(id: string, name: unknown): Promise<TaskBoardRow> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient()
    .from("task_boards")
    .update({ name: cleanName(name) })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id, name, position")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BoardError(404, "Board not found.");
  return data as TaskBoardRow;
}

// Tasks on the board move back to the main Task Board (FK on delete set null).
export async function deleteBoard(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient().from("task_boards").delete().eq("id", id).eq("org_id", orgId).select("id");
  if (error) throw error;
  if (!data?.length) throw new BoardError(404, "Board not found.");
}

// A board id from the browser is only kept if it belongs to this workspace.
export async function boardInOrg(orgId: string, boardId: string | null | undefined): Promise<string | null> {
  if (!boardId) return null;
  const { data } = await createAdminClient().from("task_boards").select("id").eq("id", boardId).eq("org_id", orgId).maybeSingle();
  return data ? (data.id as string) : null;
}

// ── The built-in "General" board (tasks not on any sub board) ────────────────

export const DEFAULT_GENERAL_NAME = "General";

export async function getGeneralName(): Promise<string> {
  const orgId = await getCurrentOrgId();
  const { data } = await createAdminClient().from("organizations").select("*").eq("id", orgId).maybeSingle();
  const name = (data as { general_board_name?: string | null } | null)?.general_board_name;
  return name?.trim() || DEFAULT_GENERAL_NAME;
}

export async function renameGeneral(name: unknown): Promise<string> {
  const orgId = await getCurrentOrgId();
  const clean = cleanName(name);
  const { error } = await createAdminClient()
    .from("organizations")
    .update({ general_board_name: clean === DEFAULT_GENERAL_NAME ? null : clean })
    .eq("id", orgId);
  if (error) {
    if (/general_board_name/.test(error.message ?? "")) {
      throw new BoardError(400, "Renaming this board needs a database update: run supabase/migrations/0032_general_board_name.sql in the Supabase SQL editor.");
    }
    throw error;
  }
  return clean;
}

// "Deleting" General: its tasks move to another board (General shows again only
// if a task is ever saved without a board).
export async function moveGeneralTasks(toBoardId: unknown): Promise<number> {
  const orgId = await getCurrentOrgId();
  const target = await boardInOrg(orgId, typeof toBoardId === "string" ? toBoardId : null);
  if (!target) throw new BoardError(400, "Choose the board its tasks should move to.");
  const { data, error } = await createAdminClient()
    .from("tasks")
    .update({ board_id: target, column_id: null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .is("board_id", null)
    .select("id");
  if (error) {
    // Before migration 0010 there is no column_id.
    if (/column_id/.test(error.message ?? "")) {
      const r = await createAdminClient().from("tasks").update({ board_id: target }).eq("org_id", orgId).is("board_id", null).select("id");
      if (r.error) throw r.error;
      return (r.data ?? []).length;
    }
    throw error;
  }
  return (data ?? []).length;
}

// ── Each board's own quick filters ("+ Add more") ───────────────────────────
// { "<board id>" | "general" | "all": [ { id, kind, value } ] }

export async function getBoardFilters(): Promise<Record<string, CustomFilter[]>> {
  const orgId = await getCurrentOrgId();
  const { data } = await createAdminClient().from("organizations").select("*").eq("id", orgId).maybeSingle();
  const raw = (data as { board_filters?: unknown } | null)?.board_filters;
  const out: Record<string, CustomFilter[]> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = cleanFilters(v);
  return out;
}

export async function setBoardFilters(board: unknown, filters: unknown): Promise<Record<string, CustomFilter[]>> {
  const orgId = await getCurrentOrgId();
  const key = typeof board === "string" && (board === "general" || board === "all" || /^[0-9a-f-]{36}$/i.test(board)) ? board : null;
  if (!key) throw new BoardError(400, "Unknown board.");
  if (key !== "general" && key !== "all" && !(await boardInOrg(orgId, key))) throw new BoardError(404, "Board not found.");
  const all = await getBoardFilters();
  all[key] = cleanFilters(filters);
  const { error } = await createAdminClient().from("organizations").update({ board_filters: all }).eq("id", orgId);
  if (error) {
    if (/board_filters/.test(error.message ?? "")) {
      throw new BoardError(400, "Adding filters needs a database update: run supabase/migrations/0036_board_filters.sql in the Supabase SQL editor.");
    }
    throw error;
  }
  return all;
}
