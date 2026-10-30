import { NextResponse } from "next/server";
import { firmByKey, LeadError } from "@/lib/data/leads";
import { bookConsultation, leadByBookingToken } from "@/lib/data/leadAutomation";

export const dynamic = "force-dynamic";

// POST { t, start } — a prospect books their consultation (only times still free).
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const firm = await firmByKey(key);
    if (!firm) return NextResponse.json({ error: "This page isn't available." }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as { t?: string; start?: string };
    const lead = await leadByBookingToken(firm.orgId, b.t ?? null);
    if (!lead) return NextResponse.json({ error: "This booking link isn't valid any more. Please call our office." }, { status: 404 });
    if (lead.status === "converted" || lead.status === "declined") return NextResponse.json({ error: "Please call our office to set up a time." }, { status: 400 });
    const booked = await bookConsultation(firm.orgId, lead.id, { start: String(b.start ?? ""), byProspect: true });
    return NextResponse.json({ ok: true, appointmentAt: booked.appointmentAt, location: booked.appointmentLocation });
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/public/intake/book failed:", e);
    return NextResponse.json({ error: "The time couldn't be booked. Please try another one, or call our office." }, { status: 500 });
  }
}
