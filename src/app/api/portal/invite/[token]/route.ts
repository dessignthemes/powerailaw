import { NextResponse } from "next/server";
import { inviteInfo, acceptInvite, portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { token } = await params;
    return NextResponse.json(await inviteInfo(token), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return portalFail("GET /api/portal/invite", e);
  }
}

// Sets the client's password and signs them in.
export async function POST(request: Request, { params }: P) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    await acceptInvite(token, body.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalFail("POST /api/portal/invite", e);
  }
}
