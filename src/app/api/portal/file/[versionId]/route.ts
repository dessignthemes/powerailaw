import { NextResponse } from "next/server";
import { portalFileUrl, PortalError } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Opens (or downloads with ?download=1) a shared file through a short-lived link.
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    return NextResponse.redirect(await portalFileUrl(versionId, download), 302);
  } catch (e) {
    const signedOut = e instanceof PortalError && e.status === 401;
    return NextResponse.redirect(new URL(signedOut ? "/portal/login" : "/portal?missing=1", request.url), 302);
  }
}
