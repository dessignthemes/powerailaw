import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { tagEmail, MatterMailError } from "@/lib/mail/matterMail";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// POST { provider, matterId } files this email on the matter (matterId null takes it off).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, orgId } = await requireUserOrg();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { provider?: string; matterId?: unknown };
    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const matterId = typeof body.matterId === "string" && /^[0-9a-f-]{36}$/i.test(body.matterId) ? body.matterId : null;
    const matter = await tagEmail(orgId, user.id, provider, decodeURIComponent(id).slice(0, 500), matterId);
    return NextResponse.json({ matter });
  } catch (error) {
    if (error instanceof MatterMailError || error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return mailErrorResponse("POST /api/mail/messages/[id]/matter", error);
  }
}
