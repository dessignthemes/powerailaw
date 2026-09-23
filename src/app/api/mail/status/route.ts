import { NextResponse } from "next/server";
import { connectionStatus } from "@/lib/mail/tokens";
import { requireUserId, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ connections: await connectionStatus(userId) });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/status", error);
  }
}
