import { NextResponse } from "next/server";
import { requireDocumentAccess, getDocument, deleteDocument } from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { orgId } = await requireDocumentAccess(id);
    const document = await getDocument(orgId, id);
    return NextResponse.json({ document });
  } catch (error) {
    return errorResponse("GET /api/documents/[id]", error);
  }
}

// DELETE — removes the document and all its versions for everyone in the workspace.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { orgId } = await requireDocumentAccess(id);
    const result = await deleteDocument(orgId, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse("DELETE /api/documents/[id]", error);
  }
}
