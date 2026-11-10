import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { relationshipsReport } from "@/lib/reports/relationships";
import { syncDetailsWithContacts } from "@/lib/contacts/detailsSync";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — deals per real estate office, realtor, lender, law firm, referral source.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const u = new URL(request.url).searchParams;
    const from = u.get("from");
    const to = u.get("to");
    const report = await relationshipsReport(await getCurrentOrgId(), { from: from && DATE.test(from) ? from : null, to: to && DATE.test(to) ? to : null });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/reports/relationships failed:", error);
    return NextResponse.json({ error: "The relationships report couldn't be put together. Please try again." }, { status: 500 });
  }
}

// POST { offset } → link the next 15 matters' Details to Contacts (older matters, all at once
// from Reports). Returns { done, next, total, created, matched, linked }.
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    const body = (await request.json().catch(() => ({}))) as { offset?: unknown };
    const offset = typeof body.offset === "number" && body.offset >= 0 ? Math.floor(body.offset) : 0;
    const { data, count, error } = await createAdminClient()
      .from("matters")
      .select("id", { count: "exact" })
      .eq("org_id", orgId)
      .not("details", "is", null)
      .order("id")
      .range(offset, offset + 14);
    if (error) return NextResponse.json({ error: "Matter details aren't set up yet." }, { status: 503 });
    const sum = { created: 0, matched: 0, linked: 0 };
    for (const m of (data ?? []) as { id: string }[]) {
      const r = await syncDetailsWithContacts(orgId, user.id, m.id).catch(() => null);
      if (!r) continue;
      sum.created += r.created;
      sum.matched += r.matched;
      sum.linked += r.linked;
    }
    const next = offset + (data?.length ?? 0);
    return NextResponse.json({ ...sum, next, total: count ?? next, done: !data?.length || next >= (count ?? 0) });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/reports/relationships failed:", error);
    return NextResponse.json({ error: "Linking stopped part-way. Click the button again to carry on." }, { status: 500 });
  }
}
