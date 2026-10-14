import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { syncedEvents, createSyncedEvent, teamEvents } from "@/lib/calendar/events";
import { getCurrentOrgId } from "@/lib/data/org";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET /api/calendar/events?from=ISO&to=ISO[&team=1] — the signed-in user's calendars (team=1: the whole firm's).
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
    // ?team=1: everyone in the firm, each event tagged with whose calendar it's from.
    if (url.searchParams.get("team") === "1") {
      return NextResponse.json(await teamEvents(await getCurrentOrgId(), user.id, from.toISOString(), to.toISOString()), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await syncedEvents(user.id, from.toISOString(), to.toISOString()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/events", e);
  }
}

// POST { provider, title, allDay, start, end, location?, notes? } — adds the
// event to the signed-in person's own Outlook or Google calendar.
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const provider = b.provider === "google" || b.provider === "microsoft" ? b.provider : null;
    if (!provider) return NextResponse.json({ error: "Choose a calendar." }, { status: 400 });
    const title = String(b.title ?? "").trim().slice(0, 255);
    if (!title) return NextResponse.json({ error: "Give the event a title." }, { status: 400 });
    const allDay = b.allDay === true;
    const start = String(b.start ?? "");
    const end = String(b.end ?? "");
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const valid = allDay
      ? ymd.test(start) && ymd.test(end) && end > start
      : !isNaN(Date.parse(start)) && !isNaN(Date.parse(end)) && Date.parse(end) > Date.parse(start);
    if (!valid) return NextResponse.json({ error: "Check the event's start and end times." }, { status: 400 });
    const event = await createSyncedEvent(user.id, provider, {
      title,
      allDay,
      start: allDay ? start : new Date(start).toISOString(),
      end: allDay ? end : new Date(end).toISOString(),
      location: typeof b.location === "string" ? b.location.slice(0, 255) : null,
      notes: typeof b.notes === "string" ? b.notes.slice(0, 8000) : null,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    return mailErrorResponse("POST /api/calendar/events", e);
  }
}
