import { NextResponse } from "next/server";
import { portalUploadUrl } from "@/lib/portal/messages";
import { portalFail } from "@/lib/portal/server";

export const dynamic = "force-dynamic";

// Client portal: POST { matterId, name, size } → { path, token } to upload one file straight to storage.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { matterId?: unknown; name?: unknown; size?: unknown };
    return NextResponse.json(await portalUploadUrl(body));
  } catch (e) {
    return portalFail("POST /api/portal/uploads", e);
  }
}
