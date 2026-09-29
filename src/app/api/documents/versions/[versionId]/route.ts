import { NextResponse } from "next/server";
import { requireUserOrg, signedDownloadUrl } from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// Returns a 2-minute signed URL for one version's file (?download=1 saves it
// under the document's name instead of opening it).
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await params;
    const { orgId } = await requireUserOrg();
    const asDownload = new URL(request.url).searchParams.get("download") === "1";
    const url = await signedDownloadUrl(orgId, versionId, asDownload);
    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse("GET /api/documents/versions/[versionId]", error);
  }
}
