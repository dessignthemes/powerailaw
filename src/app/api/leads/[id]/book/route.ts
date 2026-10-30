import { NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/data/org";
import { leadFail } from "@/lib/data/leads";
import { bookConsultation, bookingUrl, cancelConsultation } from "@/lib/data/leadAutomation";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };
const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// GET → { url } (the lead's own booking link, to send them)
export async function GET(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    return NextResponse.json({ url: await bookingUrl(await getCurrentOrgId(), id) });
  } catch (e) {
    return leadFail("GET /api/leads/[id]/book", e);
  }
}

// POST { start, minutes?, staffId?, location? } — the firm books the consultation.
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as { start?: string; minutes?: number; staffId?: string; location?: string };
    const lead = await bookConsultation(await getCurrentOrgId(), id, { start: String(b.start ?? ""), minutes: Number(b.minutes) || undefined, staffId: b.staffId ?? null, location: b.location ?? null });
    return NextResponse.json({ lead });
  } catch (e) {
    return leadFail("POST /api/leads/[id]/book", e);
  }
}

// DELETE — cancel the consultation (removed from the calendar too).
export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    return NextResponse.json({ lead: await cancelConsultation(await getCurrentOrgId(), id) });
  } catch (e) {
    return leadFail("DELETE /api/leads/[id]/book", e);
  }
}
