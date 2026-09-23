import { NextResponse } from "next/server";
import { requireUserOrg, signedDownloadUrl } from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// Returns a 2-minute signed URL for one version's file.
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await params;
    const { orgId } = await requireUserOrg();
    const url = await signedDownloadUrl(orgId, versionId);
    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse("GET /api/documents/versions/[versionId]", error);
  }
}
