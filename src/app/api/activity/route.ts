import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { activity } from "@/lib/data/activity";

export const dynamic = "force-dynamic";

// GET [?matter=<id>][&limit=40] → what everyone in the firm did, newest first.
export async function GET(request: Request) {
  try {
    const { orgId, user } = await requireUserOrg();
    const u = new URL(request.url).searchParams;
    const matter = u.get("matter");
    const items = await activity(orgId, { id: user.id, email: user.email ?? null }, {
      matterId: matter && /^[0-9a-f-]{36}$/i.test(matter) ? matter : null,
      limit: Number(u.get("limit")) || undefined,
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/activity failed:", e);
    return NextResponse.json({ error: "The activity couldn't be loaded." }, { status: 500 });
  }
}
