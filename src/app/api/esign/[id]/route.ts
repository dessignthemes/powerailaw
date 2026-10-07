import { NextResponse } from "next/server";
import { cancelRequest, renewLink, SignError } from "@/lib/esign/server";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

function fail(error: unknown) {
  if (error instanceof SignError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("/api/esign/[id] failed:", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

// POST { action: "renew" } — new link (the old one stops working)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { request: req, token } = await renewLink(id);
    return NextResponse.json({ request: req, link: `${new URL(request.url).origin}/sign/${token}` });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ request: await cancelRequest(id) });
  } catch (error) {
    return fail(error);
  }
}
