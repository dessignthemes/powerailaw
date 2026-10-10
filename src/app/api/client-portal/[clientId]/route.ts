import { NextResponse } from "next/server";
import { portalStatus, invite, setAccess, portalFail, PortalError } from "@/lib/portal/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ clientId: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { clientId } = await params;
    return NextResponse.json(await portalStatus(clientId));
  } catch (e) {
    return portalFail("GET /api/client-portal", e);
  }
}

export async function POST(request: Request, { params }: P) {
  try {
    const { clientId } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; email?: string };
    if (body.action === "invite") return NextResponse.json(await invite(clientId, body.email));
    if (body.action === "disable" || body.action === "enable") {
      await setAccess(clientId, body.action === "enable");
      return NextResponse.json({ ok: true });
    }
    throw new PortalError(400, "Unknown request.");
  } catch (e) {
    return portalFail("POST /api/client-portal", e);
  }
}
