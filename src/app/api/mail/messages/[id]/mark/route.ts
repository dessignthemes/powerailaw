import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { setMailMark, forgetRead, MailMarkError } from "@/lib/data/mailReads";
import { getAccessToken } from "@/lib/mail/tokens";
import { setGmailRead } from "@/lib/mail/google";
import { setOutlookRead } from "@/lib/mail/microsoft";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// POST { provider, flagged?, unread? } → flag as important (kept in LawPower) / mark as unread
// (in Outlook / Gmail when the connection allows it, otherwise kept in LawPower).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { provider?: string; flagged?: unknown; unread?: unknown };
    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const mark = {
      ...(typeof body.flagged === "boolean" ? { flagged: body.flagged } : {}),
      ...(typeof body.unread === "boolean" ? { unread: body.unread } : {}),
    };
    const msgId = decodeURIComponent(id).slice(0, 500);
    // Read / unread goes to Outlook / Gmail itself when the connection allows it.
    if (typeof mark.unread === "boolean") {
      const { token, canSync } = await getAccessToken(userId, provider).catch(() => ({ token: "", canSync: false, email: null }));
      if (canSync) {
        if (provider === "google") await setGmailRead(token, msgId, !mark.unread);
        else await setOutlookRead(token, msgId, !mark.unread);
        await forgetRead(userId, provider, msgId);
        const rest = { ...mark, unread: false }; // nothing kept in LawPower: the mailbox has it
        return NextResponse.json({ ...(await setMailMark(userId, provider, msgId, rest)), synced: true });
      }
    }
    return NextResponse.json(await setMailMark(userId, provider, msgId, mark));
  } catch (error) {
    if (error instanceof MailMarkError) return NextResponse.json({ error: error.message }, { status: 503 });
    return mailErrorResponse("POST /api/mail/messages/[id]/mark", error);
  }
}
