import { NextResponse } from "next/server";
import { portalSignLink } from "@/lib/portal/matterView";
import { PortalError } from "@/lib/portal/server";
import { SignError } from "@/lib/esign/server";

export const dynamic = "force-dynamic";

// POST → a signing link for a document waiting for this client's signature.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await portalSignLink(id));
  } catch (e) {
    if (e instanceof PortalError || e instanceof SignError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/portal/sign/[id] failed:", e);
    return NextResponse.json({ error: "The document couldn't be opened for signing." }, { status: 500 });
  }
}
