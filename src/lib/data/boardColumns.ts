import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import { BoardError, boardInOrg } from "@/lib/data/boards";

export type ColumnRow = { id: string; board_id: string | null; status: string | null; title: string; color: string; position: number };
const COLS = "id, board_id, status, title, color, position";
const STATUSES = ["todo", "inprogress", "waiting", "done"];

// "general" or a board id → the board_id to store (null = General). Board ids
// are checked against the workspace.
async function resolveBoard(orgId: string, board: unknown): Promise<string | null> {
  if (board === "general" || board === null || board === undefined || board === "") return null;
  const id = await boardInOrg(orgId, String(board));
  if (!id) throw new BoardError(404, "Board not found.");
  return id;
}

const cleanTitle = (t: unknown) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!s) throw new BoardError(400, "Give the column a name.");
  return s;
};
const cleanColor = (c: unknown) => (typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : "#6B7280");

export async function listColumns(board: unknown): Promise<ColumnRow[]> {
  const orgId = await getCurrentOrgId();
  const boardId = await resolveBoard(orgId, board);
  let q = createAdminClient().from("board_columns").select(COLS).eq("org_id", orgId);
  q = boardId ? q.eq("board_id", boardId) : q.is("board_id", null);
  const { data, error } = await q.order("position").order("created_at");
  if (error) throw error;
  return (data ?? []) as ColumnRow[];
}

// A new custom column (status = null), or a standard column's name/color.
export async function saveColumn(input: { board?: unknown; status?: unknown; title?: unknown; color?: unknown }): Promise<ColumnRow> {
  const orgId = await getCurrentOrgId();
  const boardId = await resolveBoard(orgId, input.board);
  const db = createAdminClient();
  const title = cleanTitle(input.title);
  const color = cleanColor(input.color);

  if (input.status !== undefined && input.status !== null) {
    const status = String(input.status);
    if (!STATUSES.includes(status)) throw new BoardError(400, "Unknown column.");
    let q = db.from("board_columns").select("id").eq("org_id", orgId).eq("status", status);
    q = boardId ? q.eq("board_id", boardId) : q.is("board_id", null);
    const { data: existing } = await q.maybeSingle();
    const res = existing
      ? await db.from("board_columns").update({ title, color }).eq("id", existing.id).select(COLS).single()
      : await db.from("board_columns").insert({ org_id: orgId, board_id: boardId, status, title, color, position: STATUSES.indexOf(status) }).select(COLS).single();
    if (res.error) throw res.error;
    return res.data as ColumnRow;
  }

  let countQ = db.from("board_columns").select("*", { count: "exact", head: true }).eq("org_id", orgId).is("status", null);
  countQ = boardId ? countQ.eq("board_id", boardId) : countQ.is("board_id", null);
  const { count } = await countQ;
  if ((count ?? 0) >= 12) throw new BoardError(400, "A board can have up to 12 extra columns.");
  const { data, error } = await db
    .from("board_columns")
    .insert({ org_id: orgId, board_id: boardId, status: null, title, color, position: 10 + (count ?? 0) })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as ColumnRow;
}

export async function updateColumn(id: string, patch: { title?: unknown; color?: unknown }): Promise<ColumnRow> {
  const orgId = await getCurrentOrgId();
  const fields: Record<string, string> = {};
  if (patch.title !== undefined) fields.title = cleanTitle(patch.title);
  if (patch.color !== undefined) fields.color = cleanColor(patch.color);
  const { data, error } = await createAdminClient().from("board_columns").update(fields).eq("id", id).eq("org_id", orgId).select(COLS).maybeSingle();
  if (error) throw error;
  if (!data) throw new BoardError(404, "Column not found.");
  return data as ColumnRow;
}

// Only custom columns can be deleted; their tasks go back to their status column.
export async function deleteColumn(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient().from("board_columns").delete().eq("id", id).eq("org_id", orgId).is("status", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new BoardError(404, "Column not found.");
}

// A column id from the browser is only kept if it's a custom column in this workspace.
export async function columnInOrg(orgId: string, columnId: string | null | undefined): Promise<string | null> {
  if (!columnId) return null;
  const { data } = await createAdminClient().from("board_columns").select("id").eq("id", columnId).eq("org_id", orgId).is("status", null).maybeSingle();
  return data ? (data.id as string) : null;
}
