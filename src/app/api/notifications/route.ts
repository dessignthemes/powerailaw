import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";
import { listNotifications, markAllRead } from "@/lib/data/notifications";

export const dynamic = "force-dynamic";

function fail(where: string, error: unknown) {
  if (error instanceof AccessError || error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Alerts couldn't be loaded." }, { status: 500 });
}

// GET → the signed-in member's latest alerts and how many are unread.
export async function GET() {
  try {
    const { user, orgId } = await requireUserOrg();
    return NextResponse.json(await listNotifications(orgId, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail("GET /api/notifications", e);
  }
}

// POST { action: "read_all" } → marks them read (the bell stops being red).
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "read_all") await markAllRead(orgId, user.id);
    return NextResponse.json(await listNotifications(orgId, user.id));
  } catch (e) {
    return fail("POST /api/notifications", e);
  }
}
