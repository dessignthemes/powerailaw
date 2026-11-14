import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFolders } from "@/lib/data/documents";

// Folders and subfolders for a matter's documents (migration 0071).
const db = () => createAdminClient();

export type DocFolder = { id: string; matterId: string; parentId: string | null; name: string; createdAt: string };
type Row = { id: string; matter_id: string; parent_id: string | null; name: string; created_at: string };
const toFolder = (r: Row): DocFolder => ({ id: r.id, matterId: r.matter_id, parentId: r.parent_id, name: r.name, createdAt: r.created_at });

export class FolderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
async function ready() {
  if (!(await hasFolders())) throw new FolderError(503, "Folders need a database update. Run supabase/migrations/0071_document_folders.sql in the Supabase SQL editor, then try again.");
}
const cleanName = (v: unknown) => {
  const n = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!n) throw new FolderError(400, "Give the folder a name.");
  return n;
};
async function folder(orgId: string, id: string): Promise<Row> {
  const { data } = await db().from("document_folders").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!data) throw new FolderError(404, "That folder wasn't found.");
  return data as Row;
}

export async function listFolders(orgId: string, matterId: string): Promise<{ folders: DocFolder[]; setupRequired?: boolean }> {
  if (!(await hasFolders())) return { folders: [], setupRequired: true };
  const { data, error } = await db().from("document_folders").select("*").eq("org_id", orgId).eq("matter_id", matterId).order("name");
  if (error) throw error;
  return { folders: ((data ?? []) as Row[]).map(toFolder) };
}

export async function createFolder(orgId: string, userId: string, matterId: string, parentId: string | null, name: unknown): Promise<DocFolder> {
  await ready();
  const { data: m } = await db().from("matters").select("id").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  if (!m) throw new FolderError(404, "Matter not found.");
  if (parentId) {
    const p = await folder(orgId, parentId);
    if (p.matter_id !== matterId) throw new FolderError(400, "That folder belongs to another matter.");
  }
  const { data, error } = await db()
    .from("document_folders")
    .insert({ org_id: orgId, matter_id: matterId, parent_id: parentId, name: cleanName(name), created_by: userId })
    .select("*")
    .single();
  if (error) throw error;
  return toFolder(data as Row);
}

// Rename, or move into another folder (parentId; null = top level).
export async function updateFolder(orgId: string, id: string, patch: { name?: unknown; parentId?: string | null }): Promise<DocFolder> {
  await ready();
  const f = await folder(orgId, id);
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = cleanName(patch.name);
  if (patch.parentId !== undefined) {
    if (patch.parentId) {
      // Not into itself or one of its own subfolders.
      const { data: all } = await db().from("document_folders").select("id, parent_id").eq("org_id", orgId).eq("matter_id", f.matter_id);
      const parentOf = new Map(((all ?? []) as { id: string; parent_id: string | null }[]).map((x) => [x.id, x.parent_id]));
      for (let cur: string | null | undefined = patch.parentId; cur; cur = parentOf.get(cur)) if (cur === id) throw new FolderError(400, "A folder can't go inside itself.");
      if (!parentOf.has(patch.parentId)) throw new FolderError(400, "That folder belongs to another matter.");
    }
    update.parent_id = patch.parentId;
  }
  const { data, error } = await db().from("document_folders").update(update).eq("id", id).eq("org_id", orgId).select("*").single();
  if (error) throw error;
  return toFolder(data as Row);
}

// Deleting a folder keeps everything in it: its documents and subfolders move up one level.
export async function deleteFolder(orgId: string, id: string) {
  await ready();
  const f = await folder(orgId, id);
  await db().from("documents").update({ folder_id: f.parent_id }).eq("org_id", orgId).eq("folder_id", id);
  await db().from("document_folders").update({ parent_id: f.parent_id }).eq("org_id", orgId).eq("parent_id", id);
  await db().from("document_folders").delete().eq("id", id).eq("org_id", orgId);
}

// Put a document in a folder (null = top level).
export async function moveDocument(orgId: string, documentId: string, folderId: string | null) {
  await ready();
  const { data: d } = await db().from("documents").select("id, matter_id").eq("id", documentId).eq("org_id", orgId).maybeSingle();
  if (!d) throw new FolderError(404, "Document not found.");
  if (folderId) {
    const f = await folder(orgId, folderId);
    if (f.matter_id !== (d as { matter_id: string }).matter_id) throw new FolderError(400, "That folder belongs to another matter.");
  }
  const { error } = await db().from("documents").update({ folder_id: folderId }).eq("id", documentId).eq("org_id", orgId);
  if (error) throw error;
}
