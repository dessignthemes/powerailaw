import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { recentLocations } from "@/lib/calendar/events";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET → { locations } — places from the person's past and upcoming events, most used first.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ locations: await recentLocations(user.id) }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/locations", e);
  }
}
