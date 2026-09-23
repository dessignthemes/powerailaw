import { NextResponse } from "next/server";
import {
  requireUserOrg,
  requireMatterAccess,
  listDocuments,
  createDocumentFromUpload,
} from "@/lib/data/documents";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// GET /api/documents?matterId=… (omit matterId for every matter you can see)
export async function GET(request: Request) {
  try {
    const matterId = new URL(request.url).searchParams.get("matterId");
    const { orgId } = matterId ? await requireMatterAccess(matterId) : await requireUserOrg();
    const documents = await listDocuments(orgId, matterId ?? undefined);
    return NextResponse.json({ documents });
  } catch (error) {
    return errorResponse("GET /api/documents", error);
  }
}

// POST /api/documents { matterId, title, path } — finalize a new upload
export async function POST(request: Request) {
  try {
    const { matterId, title, path } = (await request.json()) as {
      matterId: string;
      title: string;
      path: string;
    };
    const ctx = await requireMatterAccess(matterId);
    const document = await createDocumentFromUpload({
      orgId: ctx.orgId,
      matterId: ctx.matter.id,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      title,
      path,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse("POST /api/documents", error);
  }
}
