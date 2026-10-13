import { NextResponse } from "next/server";
import { listMatterPortalMessages, sendPortalMessage, unreadPortalReplies } from "@/lib/portal/messages";
import { portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

// GET → the matter's secure messages (opening them marks the client's replies read).
// GET ?count=1 → just the number of unread client replies.
export async function GET(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.get("count") === "1") return NextResponse.json({ unread: await unreadPortalReplies(id) });
    return NextResponse.json(await listMatterPortalMessages(id));
  } catch (e) {
    return portalFail("GET /api/matters/[id]/portal-messages", e);
  }
}

// POST { body, documentIds } → sends a secure message to the matter's client.
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { body?: unknown; documentIds?: unknown };
    return NextResponse.json(await sendPortalMessage(id, body), { status: 201 });
  } catch (e) {
    return portalFail("POST /api/matters/[id]/portal-messages", e);
  }
}
