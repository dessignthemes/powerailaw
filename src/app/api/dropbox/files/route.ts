import { NextResponse } from "next/server";
import { dropboxSession, listFolder } from "@/lib/dropbox/client";
import { requireUser, cleanPath, dropboxErrorResponse } from "@/lib/dropbox/api";

export const dynamic = "force-dynamic";

// GET ?path=/Folder&cursor=… — one page of a folder's contents
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const q = new URL(request.url).searchParams;
    const s = await dropboxSession(user.id);
    return NextResponse.json(await listFolder(s, cleanPath(q.get("path")), q.get("cursor")));
  } catch (error) {
    return dropboxErrorResponse("GET /api/dropbox/files", error);
  }
}
