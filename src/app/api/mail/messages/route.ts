import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmail } from "@/lib/mail/google";
import { listOutlook } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";
import { readMessageIds, mailMarks } from "@/lib/data/mailReads";
import { matchInbox } from "@/lib/mail/matterMail";
import { requireUserOrg } from "@/lib/data/documents";

export const dynamic = "force-dynamic";

// GET /api/mail/messages?provider=google&folder=…&q=…&pageToken=…
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const url = new URL(request.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });

    const q = url.searchParams.get("q")?.slice(0, 200) ?? undefined;
    const pageToken = url.searchParams.get("pageToken") ?? undefined;
    const folder = url.searchParams.get("folder")?.slice(0, 400) ?? undefined;
    const unreadOnly = url.searchParams.get("unread") === "1";
    const { token, email, canSync } = await getAccessToken(userId, provider);
    const page =
      provider === "google"
        ? await listGmail(token, { q, pageToken, folder, unread: unreadOnly })
        : await listOutlook(token, { q, pageToken, folder, unread: unreadOnly });
    // Emails opened in LawPower show as read, even though the mailbox itself
    // (which LawPower never changes) may still mark them unread.
    // A mailbox that syncs read / unread is the single source of truth (Outlook / Gmail).
    const unreadIds = canSync ? [] : page.messages.filter((m) => m.unread).map((m) => m.id);
    const opened = await readMessageIds(userId, provider, unreadIds);
    let messages = opened.size ? page.messages.map((m) => (opened.has(m.id) ? { ...m, unread: false } : m)) : page.messages;
    // Flagged / marked unread in LawPower.
    const marks = await mailMarks(userId, provider, messages.map((m) => m.id));
    if (marks.size) {
      messages = messages.map((m) => {
        const mk = marks.get(m.id);
        return mk ? { ...m, flagged: mk.flagged, unread: mk.unread && !canSync ? true : m.unread } : m;
      });
    }
    // The matter each email is on (emails carrying a matter number are filed to it).
    try {
      const { orgId } = await requireUserOrg();
      messages = await matchInbox(orgId, userId, provider, email, messages);
    } catch (e) {
      console.error("Matching emails to matters failed:", e);
    }
    return NextResponse.json({ ...page, messages });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages", error);
  }
}
