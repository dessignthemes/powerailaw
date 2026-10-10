import { NextResponse } from "next/server";
import { setShared, portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Share (or stop sharing) a document with the client in the client portal.
export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const body = (await request.json().catch(() => ({}))) as { shared?: boolean };
    await setShared(documentId, body.shared === true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalFail("POST /api/client-portal/documents", e);
  }
}
