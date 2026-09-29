import { NextResponse } from "next/server";
import {
  requireMatterAccess,
  requireDocumentAccess,
  newStoragePath,
  createUploadUrl,
  requireFileTypes,
} from "@/lib/data/documents";
import { MAX_DOCUMENT_BYTES, fileProblemMessages, fileTypeFromName } from "@/lib/documents/fileTypes";
import { errorResponse } from "@/lib/apiErrors";

export const dynamic = "force-dynamic";

// Issues a one-time signed URL so the browser uploads straight to private
// storage (avoids serverless body-size limits). The file is validated when
// the client finalizes via POST /api/documents or /api/documents/[id]/versions.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      matterId?: string;
      documentId?: string;
      fileName?: string;
      size?: number;
    };

    if (typeof body.size !== "number" || body.size <= 0) {
      return NextResponse.json({ error: fileProblemMessages.empty, code: "empty" }, { status: 422 });
    }
    if (body.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: fileProblemMessages.too_large, code: "too_large" }, { status: 422 });
    }
    // No name means an edited PDF from Power PDF.
    const type = body.fileName ? fileTypeFromName(body.fileName) : "pdf";
    if (!type) {
      return NextResponse.json({ error: fileProblemMessages.unsupported, code: "unsupported" }, { status: 422 });
    }
    // Check before uploading: storage only accepts non-PDF files after 0013.
    if (type !== "pdf") await requireFileTypes();

    let orgId: string;
    let matterId: string;
    if (body.documentId) {
      const ctx = await requireDocumentAccess(body.documentId);
      orgId = ctx.orgId;
      matterId = ctx.document.matter_id;
    } else if (body.matterId) {
      const ctx = await requireMatterAccess(body.matterId);
      orgId = ctx.orgId;
      matterId = ctx.matter.id;
    } else {
      return NextResponse.json({ error: "Choose a matter first." }, { status: 400 });
    }

    const upload = await createUploadUrl(newStoragePath(orgId, matterId, type));
    return NextResponse.json(upload);
  } catch (error) {
    return errorResponse("POST /api/documents/upload-url", error);
  }
}
