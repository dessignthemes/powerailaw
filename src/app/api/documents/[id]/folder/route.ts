import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { moveDocument, FolderError } from "@/lib/data/documentFolders";

export const dynamic = "force-dynamic";

// PATCH { folderId } → put the document in a folder (null = top level).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { orgId } = await requireUserOrg();
    const { id } = await params;
    const b = (await request.json().catch(() => ({}))) as { folderId?: string | null };
    await moveDocument(orgId, id, typeof b.folderId === "string" ? b.folderId : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FolderError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/documents/[id]/folder failed:", e);
    return NextResponse.json({ error: "The document couldn't be moved." }, { status: 500 });
  }
}
