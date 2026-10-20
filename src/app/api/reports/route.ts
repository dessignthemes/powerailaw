import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { practiceReport } from "@/lib/reports/practice";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&today=YYYY-MM-DD — the practice overview for Reports.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const u = new URL(request.url).searchParams;
    const from = u.get("from");
    const to = u.get("to");
    const today = u.get("today");
    const report = await practiceReport(
      await getCurrentOrgId(),
      { from: from && DATE.test(from) ? from : null, to: to && DATE.test(to) ? to : null },
      today && DATE.test(today) ? today : new Date().toISOString().slice(0, 10)
    );
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/reports failed:", error);
    return NextResponse.json({ error: "The report couldn't be put together. Please try again." }, { status: 500 });
  }
}
