import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEventDetail, deleteSyncedEvent } from "@/lib/calendar/events";
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
