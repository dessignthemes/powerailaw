import { NextResponse } from "next/server";
import { dropboxSession, temporaryLink } from "@/lib/dropbox/client";
import { requireUser, cleanPath, dropboxErrorResponse } from "@/lib/dropbox/api";

export const dynamic = "force-dynamic";

// GET ?path=… — a short-lived direct link to read the file (previews, downloads)
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const s = await dropboxSession(user.id);
    return NextResponse.json(await temporaryLink(s, cleanPath(new URL(request.url).searchParams.get("path"), false)));
  } catch (error) {
    return dropboxErrorResponse("GET /api/dropbox/link", error);
  }
}
