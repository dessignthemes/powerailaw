import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmailConversation } from "@/lib/mail/google";
import { listOutlookConversation } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET ?provider= → every email in a conversation / thread, newest first, from
// the signed-in person's own mailbox (Sent Items included), plus that mailbox's address.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const { id } = await params;
    const threadId = decodeURIComponent(id).slice(0, 500);
    const { token, email } = await getAccessToken(userId, provider);
    const messages = provider === "google" ? await listGmailConversation(token, threadId) : await listOutlookConversation(token, threadId);
    return NextResponse.json({ messages, mailbox: email }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/threads/[id]", error);
  }
}
