import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { updateFolder, deleteFolder, FolderError } from "@/lib/data/documentFolders";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const fail = (where: string, e: unknown) => {
  if (e instanceof FolderError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
};

// PATCH { name?, parentId? } → rename or move a folder.
export async function PATCH(request: Request, { params }: P) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    const b = (await request.json().catch(() => ({}))) as { name?: string; parentId?: string | null };
    return NextResponse.json({ folder: await updateFolder(orgId, id, b) });
  } catch (e) {
    return fail("PATCH /api/documents/folders/[id]", e);
  }
}

// DELETE → removes the folder; what was in it moves up one level.
export async function DELETE(_request: Request, { params }: P) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    await deleteFolder(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail("DELETE /api/documents/folders/[id]", e);
  }
}
