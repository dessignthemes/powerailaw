import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEventDetail, deleteSyncedEvent, updateSyncedEvent, colleagueEventDetail } from "@/lib/calendar/events";
import { getCurrentOrgId } from "@/lib/data/org";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

function provider(request: Request) {
  const p = new URL(request.url).searchParams.get("provider");
  return p === "google" || p === "microsoft" ? p : null;
}

// GET /api/calendar/events/:id?provider=… — one event, from the person's own calendar
export async function GET(request: Request, { params }: P) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const p = provider(request);
    if (!p) return NextResponse.json({ error: "Unknown calendar." }, { status: 400 });
    const { id } = await params;
    // ?owner=<member id>: a colleague's event (read-only, same firm, not private).
    const owner = new URL(request.url).searchParams.get("owner");
    if (owner && owner !== user.id && /^[0-9a-f-]{36}$/i.test(owner)) {
      return NextResponse.json({ event: await colleagueEventDetail(await getCurrentOrgId(), owner, p, id), readOnly: true });
    }
    return NextResponse.json({ event: await getEventDetail(user.id, p, id) });
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/events/[id]", e);
  }
}

export async function DELETE(request: Request, { params }: P) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const p = provider(request);
    if (!p) return NextResponse.json({ error: "Unknown calendar." }, { status: 400 });
    const { id } = await params;
    await deleteSyncedEvent(user.id, p, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mailErrorResponse("DELETE /api/calendar/events/[id]", e);
  }
}

// PATCH { title, allDay, start, end, location, notes? } — edit the event in the person's own calendar
export async function PATCH(request: Request, { params }: P) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const p = provider(request);
    if (!p) return NextResponse.json({ error: "Unknown calendar." }, { status: 400 });
    const { id } = await params;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = String(b.title ?? "").trim().slice(0, 255);
    if (!title) return NextResponse.json({ error: "Give the event a title." }, { status: 400 });
    const allDay = b.allDay === true;
    const start = String(b.start ?? "");
    const end = String(b.end ?? "");
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const valid = allDay
      ? ymd.test(start) && ymd.test(end) && end > start
      : !isNaN(Date.parse(start)) && !isNaN(Date.parse(end)) && Date.parse(end) > Date.parse(start);
    if (!valid) return NextResponse.json({ error: "The end has to be after the start." }, { status: 400 });
    const event = await updateSyncedEvent(user.id, p, id, {
      title,
      allDay,
      start: allDay ? start : new Date(start).toISOString(),
      end: allDay ? end : new Date(end).toISOString(),
      location: typeof b.location === "string" && b.location.trim() ? b.location.trim().slice(0, 255) : null,
      ...(typeof b.notes === "string" ? { notes: b.notes.slice(0, 8000) } : {}),
    });
    return NextResponse.json({ event });
  } catch (e) {
    return mailErrorResponse("PATCH /api/calendar/events/[id]", e);
  }
}
