import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { syncedEvents } from "@/lib/calendar/events";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET /api/calendar/events?from=ISO&to=ISO — the signed-in user's own calendars only.
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get("from") ?? "");
    const to = new Date(url.searchParams.get("to") ?? "");
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 62 * 86400_000) {
      return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    }
    return NextResponse.json(await syncedEvents(user.id, from.toISOString(), to.toISOString()));
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/events", e);
  }
}
