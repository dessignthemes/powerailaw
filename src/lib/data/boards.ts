import "server-only";
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
