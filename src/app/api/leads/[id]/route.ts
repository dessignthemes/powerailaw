import { NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/data/org";
import { deleteLead, getLead, inviteUrl, leadFail, updateLead } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };
const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// GET → { lead } ; GET ?link=1 → { url } (the lead's personal intake link, to send again)
export async function GET(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    const orgId = await getCurrentOrgId();
    if (new URL(request.url).searchParams.get("link") === "1") return NextResponse.json({ url: await inviteUrl(orgId, id) });
    return NextResponse.json({ lead: await getLead(orgId, id) });
  } catch (e) {
    return leadFail("GET /api/leads/[id]", e);
  }
}

// PATCH { status?, notes?, clientId?, form? }
export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    const orgId = await getCurrentOrgId();
    return NextResponse.json({ lead: await updateLead(orgId, id, await request.json().catch(() => ({}))) });
  } catch (e) {
    return leadFail("PATCH /api/leads/[id]", e);
  }
}

export async function DELETE(_request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!valid(id)) return NextResponse.json({ error: "That lead wasn't found." }, { status: 404 });
    await deleteLead(await getCurrentOrgId(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return leadFail("DELETE /api/leads/[id]", e);
  }
}
