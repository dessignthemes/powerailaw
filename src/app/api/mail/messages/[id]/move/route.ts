import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getAccessToken } from "@/lib/mail/tokens";
import { moveGmailMessage } from "@/lib/mail/google";
import { moveOutlookMessage } from "@/lib/mail/microsoft";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// POST { provider, to, from? } → move an email to another folder in the user's own mailbox.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { provider?: string; to?: unknown; from?: unknown };
    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const to = typeof body.to === "string" ? body.to.slice(0, 500) : "";
    if (!to) return NextResponse.json({ error: "Choose a folder." }, { status: 400 });
    const from = typeof body.from === "string" && body.from ? body.from.slice(0, 500) : null;
    const msgId = decodeURIComponent(id).slice(0, 500);
    const { token, canSync } = await getAccessToken(userId, provider);
    if (!canSync) {
      return NextResponse.json({ error: "Reconnect your mailbox once to let LawPower move emails.", reconnect: true }, { status: 403 });
    }
    if (provider === "google") await moveGmailMessage(token, msgId, to, from ?? "INBOX");
    else await moveOutlookMessage(token, msgId, to);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mailErrorResponse("POST /api/mail/messages/[id]/move", error);
  }
}
