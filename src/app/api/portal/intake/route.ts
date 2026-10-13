import { NextResponse } from "next/server";
import { getPortalIntake, savePortalIntake } from "@/lib/portal/intake";
import { portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Client portal: the client's intake sheet (their details from the client card).
export async function GET() {
  try {
    return NextResponse.json(await getPortalIntake(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return portalFail("GET /api/portal/intake", e);
  }
}

// PUT { people, company, address, poBox, intake } → saved into the client card.
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    return NextResponse.json(await savePortalIntake(body));
  } catch (e) {
    return portalFail("PUT /api/portal/intake", e);
  }
}
