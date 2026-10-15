import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { getGmail, setGmailRead } from "@/lib/mail/google";
import { getOutlook, setOutlookRead } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";
import { markMailRead, clearUnreadMark } from "@/lib/data/mailReads";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });

    const { token, email, canSync } = await getAccessToken(userId, provider);
    const message = provider === "google" ? await getGmail(token, id, email) : await getOutlook(token, id);
    await clearUnreadMark(userId, provider, id);
    if (canSync) {
      // Opened in LawPower = read in Outlook / Gmail too.
      try {
        if (provider === "google") await setGmailRead(token, id, true);
        else await setOutlookRead(token, id, true);
      } catch (e) {
        console.error("Marking read in the mailbox failed:", e);
        await markMailRead(userId, provider, id); // at least read in LawPower
      }
    } else {
      await markMailRead(userId, provider, id); // read-only connection: kept in LawPower
    }
    return NextResponse.json({ message });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages/[id]", error);
  }
}
