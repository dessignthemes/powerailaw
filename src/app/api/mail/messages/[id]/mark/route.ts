import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { setMailMark, MailMarkError } from "@/lib/data/mailReads";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// POST { provider, flagged?, unread? } → flag as important / mark as unread (kept in LawPower).
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
    return NextResponse.json(await setMailMark(userId, provider, decodeURIComponent(id).slice(0, 500), mark));
  } catch (error) {
    if (error instanceof MailMarkError) return NextResponse.json({ error: error.message }, { status: 503 });
    return mailErrorResponse("POST /api/mail/messages/[id]/mark", error);
  }
}
