import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmailFolders, createGmailLabel } from "@/lib/mail/google";
import { listOutlookFolders, createOutlookFolder } from "@/lib/mail/microsoft";
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

// POST { provider, name, parentId? } → create a folder (Outlook folder / Gmail label) in the user's own mailbox.
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { provider?: string; name?: unknown; parentId?: unknown };
    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const name = typeof body.name === "string" ? body.name.trim().replace(/[\\/]+/g, "-").slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "Give the folder a name." }, { status: 400 });
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId.slice(0, 500) : null;
    const { token, canSync } = await getAccessToken(userId, provider);
    if (!canSync) {
      return NextResponse.json({ error: "Reconnect your mailbox once to let LawPower create folders and move emails.", reconnect: true }, { status: 403 });
    }
    const folder = provider === "google" ? await createGmailLabel(token, name, parentId) : await createOutlookFolder(token, name, parentId);
    return NextResponse.json({ folder });
  } catch (error) {
    return mailErrorResponse("POST /api/mail/folders", error);
  }
}
