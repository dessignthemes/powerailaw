import { NextResponse } from "next/server";
import { dropboxSession, search } from "@/lib/dropbox/client";
import { requireUser, cleanPath, dropboxErrorResponse } from "@/lib/dropbox/api";

export const dynamic = "force-dynamic";

// GET ?q=retainer&path=/Clients — search file and folder names
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    if (!q) return NextResponse.json({ entries: [] });
    const s = await dropboxSession(user.id);
    return NextResponse.json({ entries: await search(s, q, cleanPath(params.get("path"))) });
  } catch (error) {
    return dropboxErrorResponse("GET /api/dropbox/search", error);
  }
}
