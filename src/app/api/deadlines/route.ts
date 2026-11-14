import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { deadlines } from "@/lib/data/deadlines";

export const dynamic = "force-dynamic";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD[&matter=<id>] → key dates, workflow steps and tasks due.
export async function GET(request: Request) {
  try {
    const { orgId, user } = await requireUserOrg();
    const u = new URL(request.url).searchParams;
    const from = u.get("from") ?? "";
    const to = u.get("to") ?? "";
    if (!YMD.test(from) || !YMD.test(to) || from > to) return NextResponse.json({ error: "Pick a date range." }, { status: 400 });
    const matter = u.get("matter");
    const items = await deadlines(orgId, { id: user.id, email: user.email ?? null }, { from, to }, matter && /^[0-9a-f-]{36}$/i.test(matter) ? matter : null);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/deadlines failed:", e);
    return NextResponse.json({ error: "The calendar couldn't be loaded." }, { status: 500 });
  }
}
