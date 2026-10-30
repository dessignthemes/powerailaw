import { NextResponse } from "next/server";
import { firmByKey } from "@/lib/data/leads";
import { availableSlots, leadByBookingToken } from "@/lib/data/leadAutomation";

export const dynamic = "force-dynamic";

// GET ?t=<booking token> → { slots, tz, minutes, location, booked } — consultation times a prospect can pick.
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const firm = await firmByKey(key);
    if (!firm) return NextResponse.json({ error: "This page isn't available." }, { status: 404 });
    const lead = await leadByBookingToken(firm.orgId, new URL(request.url).searchParams.get("t"));
    if (!lead) return NextResponse.json({ error: "This booking link isn't valid any more. Please call our office." }, { status: 404 });
    const { slots, tz, settings } = await availableSlots(firm.orgId);
    return NextResponse.json(
      { slots, tz, minutes: settings.booking.minutes, location: settings.booking.location, booked: lead.appointmentAt, name: lead.firstName },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("GET /api/public/intake/slots failed:", e);
    return NextResponse.json({ error: "Times couldn't be loaded. Please try again or call our office." }, { status: 500 });
  }
}
