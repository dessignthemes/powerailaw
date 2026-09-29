import { dropboxSession, download } from "@/lib/dropbox/client";
import { requireUser, cleanPath, dropboxErrorResponse } from "@/lib/dropbox/api";
import { FILE_TYPES, fileTypeFromName } from "@/lib/documents/fileTypes";

export const dynamic = "force-dynamic";

// Fallback for previews when the browser can't read the direct link. Server
// responses are capped around 4.5 MB on Vercel, so this is for smaller files.
const MAX_PROXY_BYTES = 4 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const s = await dropboxSession(user.id);
    const path = cleanPath(new URL(request.url).searchParams.get("path"), false);
    const { bytes, name } = await download(s, path, MAX_PROXY_BYTES);
    const type = fileTypeFromName(name);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": type ? FILE_TYPES[type].mime : "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return dropboxErrorResponse("GET /api/dropbox/preview", error);
  }
}
