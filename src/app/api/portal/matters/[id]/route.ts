import { NextResponse } from "next/server";
import { portalMatterView } from "@/lib/portal/matterView";
import { PortalError } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// GET → the client portal's page for one of the client's matters.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await portalMatterView(id));
  } catch (e) {
    if (e instanceof PortalError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("GET /api/portal/matters/[id] failed:", e);
    return NextResponse.json({ error: "This page couldn't be loaded." }, { status: 500 });
  }
}
