import { NextResponse } from "next/server";
import { portalMessages, portalReply } from "@/lib/portal/messages";
import { portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Client portal: the client's secure messages (marks the firm's messages read).
export async function GET() {
  try {
    return NextResponse.json(await portalMessages(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return portalFail("GET /api/portal/messages", e);
  }
}

// POST { matterId, body, uploads: [{ path, name }] } → the client's reply (files uploaded first via /api/portal/uploads).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { matterId?: unknown; body?: unknown; uploads?: unknown };
    return NextResponse.json(await portalReply(body), { status: 201 });
  } catch (e) {
    return portalFail("POST /api/portal/messages", e);
  }
}
