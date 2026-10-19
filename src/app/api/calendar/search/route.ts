import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchTeamEvents } from "@/lib/calendar/events";
import { getCurrentOrgId } from "@/lib/data/org";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET /api/calendar/search?q=words[&owner=<user id>] — events whose title or
// location has all the words, 6 months back to 12 months ahead. No owner: the
// whole firm's calendars. Colleagues' private events are never searched.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ error: "Type at least 2 letters." }, { status: 400 });
    const owner = url.searchParams.get("owner");
    const ownerId = owner && /^[0-9a-f-]{36}$/i.test(owner) ? owner : null;
    const result = await searchTeamEvents(await getCurrentOrgId(), user.id, q, ownerId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/search", e);
  }
}
