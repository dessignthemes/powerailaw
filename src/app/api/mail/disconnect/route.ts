import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/data/oauth";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// Removes the stored tokens for this user's mailbox. (Access can also be
// revoked from the Google/Microsoft account security page.)
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { provider: p } = (await request.json().catch(() => ({}))) as { provider?: string };
    const provider = parseProvider(p ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    await deleteConnection(userId, provider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mailErrorResponse("POST /api/mail/disconnect", error);
  }
}
