import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmail } from "@/lib/mail/google";
import { listOutlook } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";
import { readMessageIds } from "@/lib/data/mailReads";

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
    const { token } = await getAccessToken(userId, provider);
    const page =
      provider === "google" ? await listGmail(token, { q, pageToken, folder }) : await listOutlook(token, { q, pageToken, folder });
    // Emails opened in LawPower show as read, even though the mailbox itself
    // (which LawPower never changes) may still mark them unread.
    const unreadIds = page.messages.filter((m) => m.unread).map((m) => m.id);
    const opened = await readMessageIds(userId, provider, unreadIds);
    const messages = opened.size ? page.messages.map((m) => (opened.has(m.id) ? { ...m, unread: false } : m)) : page.messages;
    return NextResponse.json({ ...page, messages });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages", error);
  }
}
