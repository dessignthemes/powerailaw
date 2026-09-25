import { NextResponse } from "next/server";
import { newInviteLink, revokeInvite } from "@/lib/data/team";
import { teamError } from "@/lib/data/teamApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

// POST { action: "new_link" | "revoke" }
export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const { action } = (await request.json().catch(() => ({}))) as { action?: string };
    if (action === "revoke") {
      await revokeInvite(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "new_link") {
      const { token } = await newInviteLink(id);
      return NextResponse.json({ link: `${new URL(request.url).origin}/invite/${token}` });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return teamError("POST /api/team/invites/[id]", e);
  }
}
