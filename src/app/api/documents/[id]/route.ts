import { NextResponse } from "next/server";
import { requireDocumentAccess, getDocument } from "@/lib/data/documents";
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
