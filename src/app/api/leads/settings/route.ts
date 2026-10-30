import { NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/data/org";
import { leadFail } from "@/lib/data/leads";
import { getLeadSettings, saveLeadSettings } from "@/lib/data/leadAutomation";

export const dynamic = "force-dynamic";

// GET / PUT the firm's lead automation (online booking, follow-ups, reminders).
export async function GET() {
  try {
    return NextResponse.json({ settings: await getLeadSettings(await getCurrentOrgId()) });
  } catch (e) {
    return leadFail("GET /api/leads/settings", e);
  }
}

export async function PUT(request: Request) {
  try {
    return NextResponse.json({ settings: await saveLeadSettings(await getCurrentOrgId(), await request.json().catch(() => ({}))) });
  } catch (e) {
    return leadFail("PUT /api/leads/settings", e);
  }
}
