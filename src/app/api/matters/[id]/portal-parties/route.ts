import { NextResponse } from "next/server";
import { listParties, inviteParty, removeParty } from "@/lib/portal/parties";
import { portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Realtors and other parties with client portal access to this matter.
// GET → list · POST { name, email, role } → invite (returns the invite link token) · DELETE ?access=<id> → remove
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ parties: await listParties(id) });
  } catch (e) {
    return portalFail("GET portal-parties", e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await inviteParty(id, (await request.json().catch(() => ({}))) as Record<string, unknown>);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ ...r, link: r.token ? `${origin}/portal/invite/${r.token}` : `${origin}/portal/login` });
  } catch (e) {
    return portalFail("POST portal-parties", e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await removeParty(id, new URL(request.url).searchParams.get("access") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalFail("DELETE portal-parties", e);
  }
}
