import { NextResponse } from "next/server";
import { recentPortalMessages } from "@/lib/portal/messages";
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

// GET → recent messages clients sent through the portal (for the Inbox panel).
export async function GET() {
  try {
    return NextResponse.json(await recentPortalMessages());
  } catch (e) {
    if (e instanceof AccessError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/portal-messages/recent failed:", e);
    return NextResponse.json({ messages: [], unread: 0 });
  }
}
