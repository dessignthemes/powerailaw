import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { getGmail } from "@/lib/mail/google";
import { getOutlook } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });

    const { token, email } = await getAccessToken(userId, provider);
    const message = provider === "google" ? await getGmail(token, id, email) : await getOutlook(token, id);
    return NextResponse.json({ message });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages/[id]", error);
  }
}
