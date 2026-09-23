import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { listGmail } from "@/lib/mail/google";
import { listOutlook } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// GET /api/mail/messages?provider=google&q=…&pageToken=…
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const url = new URL(request.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });

    const q = url.searchParams.get("q")?.slice(0, 200) ?? undefined;
    const pageToken = url.searchParams.get("pageToken") ?? undefined;
    const { token } = await getAccessToken(userId, provider);
    const page = provider === "google" ? await listGmail(token, { q, pageToken }) : await listOutlook(token, { q, pageToken });
    return NextResponse.json(page);
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages", error);
  }
}
