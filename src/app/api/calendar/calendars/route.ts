import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { writableCalendars } from "@/lib/calendar/events";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET → { calendars } — the calendars the signed-in person can add events to (main one first).
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ calendars: await writableCalendars(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return mailErrorResponse("GET /api/calendar/calendars", e);
  }
}
