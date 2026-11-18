import { NextResponse } from "next/server";
import { requireDocumentAccess } from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";
import { suggestDocumentName } from "@/lib/ai/docName";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST → { name }: a name suggested by the AI from the document's first page (not saved).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { orgId, user } = await requireDocumentAccess(id);
    const name = await suggestDocumentName(orgId, user.id, id);
    return NextResponse.json({ name });
  } catch (error) {
    return errorResponse("POST /api/documents/[id]/ai-name", error);
  }
}
