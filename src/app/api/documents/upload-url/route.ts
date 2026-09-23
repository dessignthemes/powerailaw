import { NextResponse } from "next/server";
import {
  requireMatterAccess,
  requireDocumentAccess,
  newStoragePath,
  createUploadUrl,
} from "@/lib/data/documents";
import { MAX_PDF_BYTES, pdfProblemMessages } from "@/lib/pdfValidation";
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
      return NextResponse.json({ error: pdfProblemMessages.empty, code: "empty" }, { status: 422 });
    }
    if (body.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: pdfProblemMessages.too_large, code: "too_large" }, { status: 422 });
    }
    if (body.fileName && !/\.pdf$/i.test(body.fileName)) {
      return NextResponse.json({ error: pdfProblemMessages.not_pdf, code: "not_pdf" }, { status: 422 });
    }

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

    const upload = await createUploadUrl(newStoragePath(orgId, matterId));
    return NextResponse.json(upload);
  } catch (error) {
    return errorResponse("POST /api/documents/upload-url", error);
  }
}
