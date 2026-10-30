import { NextResponse } from "next/server";
import { firmByKey, submitIntake, LeadError } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

// POST — a prospective client's intake form (public: the firm's form address is the key).
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const firm = await firmByKey(key);
    if (!firm) return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ error: "That's too long. Please shorten your description." }, { status: 400 });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Please try again." }, { status: 400 });
    }
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    await submitIntake(firm, body, ip);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/public/intake failed:", e);
    return NextResponse.json({ error: "Your form couldn't be sent. Please try again, or call our office." }, { status: 500 });
  }
}
