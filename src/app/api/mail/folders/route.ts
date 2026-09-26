import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmailFolders } from "@/lib/mail/google";
import { listOutlookFolders } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET /api/mail/folders?provider=google|microsoft — the signed-in user's own mailbox only.
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const { token } = await getAccessToken(userId, provider);
    const folders = provider === "google" ? await listGmailFolders(token) : await listOutlookFolders(token);
    return NextResponse.json({ folders });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/folders", error);
  }
}
