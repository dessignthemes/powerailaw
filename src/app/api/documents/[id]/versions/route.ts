import { NextResponse } from "next/server";
import { requireDocumentAccess, addVersionFromUpload } from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// POST { path, basedOnVersionId, note } — record an edited PDF as the next
// version. Earlier versions (including the original upload) are untouched.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { path, basedOnVersionId, note } = (await request.json()) as {
      path: string;
      basedOnVersionId?: string | null;
      note?: string;
    };
    const ctx = await requireDocumentAccess(id);
    const document = await addVersionFromUpload({
      orgId: ctx.orgId,
      matterId: ctx.document.matter_id,
      documentId: id,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      path,
      basedOnVersionId: basedOnVersionId ?? null,
      note: note ?? "",
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse("POST /api/documents/[id]/versions", error);
  }
}
